// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS (GitHub Actions)
// ============================================================

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 7;
const DIAS_CRITICO = 15;

const PALAVRAS_CRITICAS = [
  'interdição', 'greve', 'acidente', 'enchente', 
  'vazou', 'paralisação', 'blitz', 'operação', 'PRF'
];

// ===== FONTES DE NOTÍCIAS =====
const FONTES = [
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'transito' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'transito' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/feed', categoria: 'policial' },
  { nome: 'Folha de SP', url: 'https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml', categoria: 'geral' },
  { nome: 'JP News', url: 'https://jovempan.com.br/feed', categoria: 'geral' },
  { nome: 'Band', url: 'https://band.com.br/feed', categoria: 'geral' }
];

// ===== FUNÇÃO: CALCULAR EXPIRAÇÃO =====
function calcularDataExpiracao(titulo, resumo, categoria) {
  const agora = new Date();
  const texto = (titulo + ' ' + resumo).toLowerCase();
  let dias = DIAS_PADRAO;

  if (categoria === 'policial' || categoria === 'acidente') dias = 15;
  else if (categoria === 'greve') dias = 20;
  if (PALAVRAS_CRITICAS.some(p => texto.includes(p))) dias = DIAS_CRITICO;

  const expira = new Date(agora);
  expira.setDate(expira.getDate() + dias);
  return expira;
}

// ===== FUNÇÃO: DETECTAR CATEGORIA =====
function detectarCategoria(titulo, resumo) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  if (texto.includes('greve') || texto.includes('paralisação')) return 'greve';
  if (texto.includes('chuva') || texto.includes('calor') || texto.includes('clima')) return 'clima';
  if (texto.includes('interdição') || texto.includes('trânsito') || texto.includes('rodovia')) return 'transito';
  if (texto.includes('acidente') || texto.includes('colisão')) return 'acidente';
  if (texto.includes('PRF') || texto.includes('policial') || texto.includes('blitz')) return 'policial';
  return 'geral';
}

// ===== FUNÇÃO PRINCIPAL =====
async function coletarNoticias() {
  console.log('📡 Iniciando coleta de notícias...');
  const parser = new Parser();
  const db = getFirestore();
  let total = 0;

  // Inicializa o Firebase Admin com a chave da conta de serviço
  // A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS aponta para o arquivo JSON
  // Portanto, não precisamos chamar initializeApp explicitamente com as credenciais
  // O SDK do Firebase Admin já detecta automaticamente.
  // Mas vamos garantir:
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('❌ Variável GOOGLE_APPLICATION_CREDENTIALS não definida');
    process.exit(1);
  }

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

        // Verifica duplicata
        const existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) continue;

        const categoria = fonte.categoria !== 'geral' ? fonte.categoria : detectarCategoria(titulo, resumo);
        const expiracao = calcularDataExpiracao(titulo, resumo, categoria);

        const texto = (titulo + ' ' + resumo).toLowerCase();
        const palavrasEncontradas = [];
        PALAVRAS_CRITICAS.forEach(p => {
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
