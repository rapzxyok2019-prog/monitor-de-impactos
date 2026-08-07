// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS (GitHub Actions)
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 7;
const DIAS_CRITICO = 15;

// ===== FONTES DE NOTÍCIAS =====
const FONTES = [
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'transito' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'transito' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/ultimas/feed', categoria: 'policial' },
  { nome: 'Band - Geral', url: 'https://band.com.br/feed/noticias', categoria: 'geral' },
  { nome: 'Folha de SP', url: 'https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml', categoria: 'geral' },
  { nome: 'JP News', url: 'https://jovempan.com.br/feed', categoria: 'geral' }
];

// ===== FUNÇÃO: CARREGAR PALAVRAS-CHAVE DO FIRESTORE =====
async function carregarPalavrasChave(db) {
  try {
    const doc = await db.collection('configuracoes').doc('geral').get();
    if (doc.exists) {
      const palavras = doc.data().palavrasChave || [];
      console.log(`📋 Palavras-chave carregadas: ${palavras.join(', ')}`);
      return palavras;
    } else {
      console.log('⚠️ Documento de configurações não encontrado. Usando lista padrão.');
      return ['greve', 'acidente', 'chuva', 'interdição', 'PRF'];
    }
  } catch (error) {
    console.error('❌ Erro ao carregar palavras-chave:', error);
    return ['greve', 'acidente', 'chuva', 'interdição', 'PRF'];
  }
}

// ===== FUNÇÃO: CALCULAR EXPIRAÇÃO =====
function calcularDataExpiracao(titulo, resumo, categoria) {
  const agora = new Date();
  const texto = (titulo + ' ' + resumo).toLowerCase();
  let dias = DIAS_PADRAO;

  if (categoria === 'policial' || categoria === 'acidente') dias = 15;
  else if (categoria === 'greve') dias = 20;
  if (['interdição', 'greve', 'acidente', 'enchente', 'vazou', 'paralisação', 'blitz', 'operação', 'PRF'].some(p => texto.includes(p))) {
    dias = DIAS_CRITICO;
  }

  const expira = new Date(agora);
  expira.setDate(expira.getDate() + dias);
  return expira;
}

// ===== FUNÇÃO: DETECTAR CATEGORIA =====
function detectarCategoria(titulo, resumo) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  if (texto.includes('greve') || texto.includes('paralisação')) return 'greve';
  if (texto.includes('chuva') || texto.includes('calor') || texto.includes('clima') || texto.includes('temperatura')) return 'clima';
  if (texto.includes('interdição') || texto.includes('trânsito') || texto.includes('rodovia') || texto.includes('br-')) return 'transito';
  if (texto.includes('acidente') || texto.includes('colisão') || texto.includes('capotamento')) return 'acidente';
  if (texto.includes('PRF') || texto.includes('policial') || texto.includes('blitz') || texto.includes('operação')) return 'policial';
  if (texto.includes('fábrica') || texto.includes('produção') || texto.includes('indústria')) return 'fabrica';
  return 'geral';
}

// ===== FUNÇÃO: VERIFICAR RELEVÂNCIA =====
function isRelevante(titulo, resumo, palavrasChave) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  return palavrasChave.some(palavra => texto.includes(palavra.toLowerCase()));
}

// ===== FUNÇÃO PRINCIPAL =====
async function coletarNoticias() {
  console.log('📡 Iniciando coleta de notícias...');

  initializeApp();
  const parser = new Parser();
  const db = getFirestore();

  // Carrega as palavras-chave do Firestore
  const palavrasChave = await carregarPalavrasChave(db);
  if (palavrasChave.length === 0) {
    console.warn('⚠️ Nenhuma palavra-chave configurada. Nenhuma notícia será coletada.');
    return 0;
  }

  let total = 0;

  for (const fonte of FONTES) {
    try {
      console.log(`📡 Coletando: ${fonte.nome}`);
      const feed = await parser.parseURL(fonte.url);
      const noticias = [];

      for (const item of feed.items.slice(0, 8)) {
        const titulo = item.title || 'Sem título';
        const resumo = item.contentSnippet || item.description || 'Sem resumo';
        const link = item.link || '#';
        const dataPub = item.pubDate ? new Date(item.pubDate) : new Date();

        // === FILTRO DE RELEVÂNCIA ===
        if (!isRelevante(titulo, resumo, palavrasChave)) {
          console.log(`⏭️ Ignorando notícia irrelevante: "${titulo.slice(0, 30)}..."`);
          continue;
        }

        // Verifica duplicata
        const existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log(`⏭️ Notícia já existe: "${titulo.slice(0, 30)}..."`);
          continue;
        }

        const categoria = fonte.categoria !== 'geral' ? fonte.categoria : detectarCategoria(titulo, resumo);
        const expiracao = calcularDataExpiracao(titulo, resumo, categoria);

        const texto = (titulo + ' ' + resumo).toLowerCase();
        const palavrasEncontradas = [];
        const criticas = ['interdição', 'greve', 'acidente', 'enchente', 'vazou', 'paralisação', 'blitz', 'operação', 'PRF'];
        criticas.forEach(p => {
          if (texto.includes(p)) palavrasEncontradas.push(p);
        });
        if (palavrasEncontradas.length === 0) {
          const comuns = ['chuva', 'calor', 'clima', 'greve', 'paralisação', 'interdição', 'acidente'];
          comuns.forEach(p => { if (texto.includes(p)) palavrasEncontradas.push(p); });
        }

        noticias.push({
          titulo, resumo, link, fonte: fonte.nome, categoria,
          dataPublicacao: dataPub, dataColeta: new Date(), dataExpiracao: expiracao,
          lidaPor: [], reacoes: { '👍': 0, '⚠️': 0, '🔥': 0 },
          palavrasChaveEncontradas: palavrasEncontradas.length > 0 ? palavrasEncontradas : ['geral']
        });
      }

      if (noticias.length > 0) {
        const batch = db.batch();
        noticias.forEach(n => { const ref = db.collection('noticias').doc(); batch.set(ref, n); });
        await batch.commit();
        console.log(`✅ ${noticias.length} notícias salvas de ${fonte.nome}`);
        total += noticias.length;
      }
    } catch (error) {
      console.error(`❌ Erro em ${fonte.nome}:`, error.message);
    }
  }

  console.log(`✅ Coleta finalizada! ${total} novas notícias.`);
  return total;
}

// ===== EXECUTAR =====
coletarNoticias()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro na coleta:', error);
    process.exit(1);
  });
