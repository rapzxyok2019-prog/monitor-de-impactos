// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS - CORRIGIDO
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');
const axios = require('axios');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 2;
const MIN_PALAVRAS_CHAVE = 1;

// ===== PALAVRAS DE BLOQUEIO =====
const PALAVRAS_BLOQUEIO = [
  'política', 'político', 'eleição', 'voto', 'presidente', 'governo',
  'partido', 'senado', 'câmara', 'deputado', 'senador', 'vereador',
  'ministro', 'governador', 'inflação', 'ibovespa', 'dólar',
  'mercado financeiro', 'bolsa de valores', 'futebol', 'campeonato',
  'jogador', 'time', 'esporte', 'olimpíada', 'celebridade', 'famoso',
  'artista', 'novela', 'cinema', 'shows', 'safra', 'soja', 'milho',
  'trigo', 'café', 'agronegócio', 'plantio', 'colheita'
];

// ===== FONTES DE NOTÍCIAS =====
const FONTES = [
  { nome: 'G1 - Geral', url: 'https://g1.globo.com/rss/g1/', categoria: 'geral' },
  { nome: 'G1 - Segurança Pública', url: 'https://g1.globo.com/rss/g1/seguranca/', categoria: 'policial' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Folha de SP', url: 'https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml', categoria: 'geral' },
  { nome: 'JP News', url: 'https://jovempan.com.br/feed', categoria: 'geral' },
  { nome: 'Agência Brasil - EBC', url: 'https://www.ebc.com.br/feed', categoria: 'policial' },
  { nome: 'R7 - Notícias', url: 'https://noticias.r7.com/feed.xml', categoria: 'geral' },
  { nome: 'R7 - Brasil', url: 'https://noticias.r7.com/brasil/feed.xml', categoria: 'geral' },
  { nome: 'Metrópoles - DF', url: 'https://www.metropoles.com/feed', categoria: 'geral' },
  { nome: 'Estadão - Geral', url: 'https://estadao.com.br/rss/geral.xml', categoria: 'geral' },
  { nome: 'Estadão - Polícia', url: 'https://estadao.com.br/rss/policia.xml', categoria: 'policial' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'transito' },
  { nome: 'G1 - Rio de Janeiro', url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', categoria: 'transito' },
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'transito' },
  { nome: 'G1 - Paraná', url: 'https://g1.globo.com/rss/g1/pr/parana/', categoria: 'transito' },
  { nome: 'G1 - Bahia', url: 'https://g1.globo.com/rss/g1/ba/bahia/', categoria: 'transito' },
  { nome: 'G1 - Pernambuco', url: 'https://g1.globo.com/rss/g1/pe/pernambuco/', categoria: 'transito' },
  { nome: 'G1 - Rio Grande do Sul', url: 'https://g1.globo.com/rss/g1/rs/rio-grande-do-sul/', categoria: 'transito' },
  { nome: 'G1 - Ceará', url: 'https://g1.globo.com/rss/g1/ce/ceara/', categoria: 'transito' },
  { nome: 'R7 - São Paulo', url: 'https://noticias.r7.com/sao-paulo/feed.xml', categoria: 'transito' },
  { nome: 'R7 - Rio de Janeiro', url: 'https://noticias.r7.com/rio-de-janeiro/feed.xml', categoria: 'transito' },
  { nome: 'O Globo - Rio', url: 'https://oglobo.globo.com/rss/rio/', categoria: 'transito' },
  { nome: 'O Globo - São Paulo', url: 'https://oglobo.globo.com/rss/sao-paulo/', categoria: 'transito' }
];

// ===== FUNÇÃO: CARREGAR PALAVRAS-CHAVE DO FIRESTORE =====
async function carregarPalavrasChave(db) {
  try {
    const doc = await db.collection('configurações').doc('geral').get();
    if (doc.exists) {
      const palavras = doc.data().palavrasChave || [];
      console.log(`📋 Palavras-chave carregadas: ${palavras.join(', ')}`);
      return palavras;
    } else {
      console.log('⚠️ Documento de configurações não encontrado. Usando lista padrão.');
      return ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'chuva', 'interdição', 'PRF', 'blitz', 'caminhoneiro'];
    }
  } catch (error) {
    console.error('❌ Erro ao carregar palavras-chave:', error);
    return ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'chuva', 'interdição', 'PRF', 'blitz', 'caminhoneiro'];
  }
}

// ===== FUNÇÃO: CARREGAR CATEGORIAS DO FIRESTORE =====
async function carregarCategorias(db) {
  try {
    const snapshot = await db.collection('categorias').get();
    const categorias = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      categorias.push({
        nome: data.nome || doc.id,
        palavras: data.palavras || []
      });
    });
    console.log(`📋 ${categorias.length} categorias carregadas do Firestore.`);
    return categorias;
  } catch (error) {
    console.error('❌ Erro ao carregar categorias:', error);
    return [];
  }
}

// ===== FUNÇÃO: VERIFICAR RELEVÂNCIA =====
function isRelevante(titulo, resumo, palavrasChave) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  for (const bloqueio of PALAVRAS_BLOQUEIO) {
    if (texto.includes(bloqueio)) return false;
  }
  let count = 0;
  for (const palavra of palavrasChave) {
    if (texto.includes(palavra.toLowerCase())) count++;
  }
  return count >= MIN_PALAVRAS_CHAVE;
}

// ===== FUNÇÃO: DETECTAR CATEGORIA =====
function detectarCategoria(titulo, resumo, categoriaFonte, categoriasFirestore) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  if (categoriaFonte && categoriaFonte !== 'geral') return categoriaFonte;

  const seguranca = ['roubo', 'assalto', 'carga', 'criminalidade', 'violência', 'tiroteio', 'confronto', 'operação policial', 'prf', 'blitz', 'bandido', 'traficante', 'apreensão', 'flagrante', 'investigação', 'vigilância', 'segurança pública', 'carga roubada', 'incêndio', 'fogo', 'queimada', 'desaparece', 'desaparecido', 'espancado', 'agressão', 'morte', 'homicídio'];
  for (const palavra of seguranca) {
    if (texto.includes(palavra)) return 'policial';
  }

  const greve = ['greve', 'paralisação', 'caminhoneiro', 'bloqueio', 'protesto', 'piquete', 'manifestação', 'travamento'];
  for (const palavra of greve) {
    if (texto.includes(palavra)) return 'greve';
  }

  const palavrasClima = categoriasFirestore.find(cat => cat.nome === 'clima')?.palavras || [];
  for (const palavra of palavrasClima) {
    if (texto.includes(palavra.toLowerCase())) return 'clima';
  }

  const acidente = ['acidente', 'colisão', 'capotamento', 'engavetamento', 'atropelamento', 'batida', 'tombamento'];
  for (const palavra of acidente) {
    if (texto.includes(palavra)) return 'acidente';
  }

  const transito = ['interdição', 'rodovia', 'br-', 'trânsito', 'congestionamento', 'desvio', 'obras'];
  for (const palavra of transito) {
    if (texto.includes(palavra)) return 'transito';
  }

  const fabrica = ['fábrica', 'produção', 'indústria', 'linha de produção', 'parada'];
  for (const palavra of fabrica) {
    if (texto.includes(palavra)) return 'fabrica';
  }

  return 'geral';
}

// ===== FUNÇÃO: EXTRAIR CIDADE =====
function extrairCidade(titulo, resumo) {
  const texto = (titulo + ' ' + resumo);
  const cidades = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre', 'Curitiba', 'Brasília', 'Salvador', 'Fortaleza', 'Recife', 'Manaus', 'Belém', 'Goiânia', 'Campinas', 'Santos', 'Congonhas', 'Ribeirão Preto', 'São José dos Campos', 'Uberlândia', 'Contagem', 'Betim', 'Nova Lima', 'SP', 'RJ', 'MG', 'RS', 'PR', 'DF', 'BA', 'PE', 'CE'];
  for (const cidade of cidades) {
    if (texto.includes(cidade)) return cidade;
  }
  return null;
}

// ===== FUNÇÃO: GEOCODIFICAR =====
async function geocodificar(cidade) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: cidade + ', Brasil', format: 'json', limit: 1 },
      headers: { 'User-Agent': 'Monitor-Frotas-PepsiCo' }
    });
    if (response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon),
        cidade: response.data[0].display_name
      };
    }
  } catch (error) {
    console.log(`⚠️ Erro ao geocodificar "${cidade}":`, error.message);
  }
  return null;
}

// ===== FUNÇÃO: CALCULAR EXPIRAÇÃO =====
function calcularDataExpiracao() {
  const agora = new Date();
  const expira = new Date(agora);
  expira.setDate(expira.getDate() + DIAS_PADRAO);
  return expira;
}

// ===== FUNÇÃO PRINCIPAL =====
async function coletarNoticias() {
  console.log('📡 Iniciando coleta de notícias...');
  initializeApp();
  const db = getFirestore();
  const parser = new Parser();

  const palavrasChave = await carregarPalavrasChave(db);
  const categoriasFirestore = await carregarCategorias(db);

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

        if (!isRelevante(titulo, resumo, palavrasChave)) {
          console.log(`⏭️ Ignorando: "${titulo.slice(0, 40)}..."`);
          continue;
        }

        const existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log(`⏭️ Duplicada: "${titulo.slice(0, 40)}..."`);
          continue;
        }

        const categoria = detectarCategoria(titulo, resumo, fonte.categoria, categoriasFirestore);
        const expiracao = calcularDataExpiracao();

        const cidade = extrairCidade(titulo, resumo);
        let localizacao = null;
        if (cidade) {
          localizacao = await geocodificar(cidade);
          if (localizacao) {
            console.log(`📍 Localização: ${cidade} → ${localizacao.lat}, ${localizacao.lng}`);
          }
        }

        const texto = (titulo + ' ' + resumo).toLowerCase();
        const palavrasEncontradas = [];
        const criticas = ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'interdição', 'enchente', 'PRF', 'blitz'];
        for (const palavra of criticas) {
          if (texto.includes(palavra)) palavrasEncontradas.push(palavra);
        }

        noticias.push({
          titulo, resumo, link, fonte: fonte.nome, categoria,
          dataPublicacao: dataPub, dataColeta: new Date(), dataExpiracao: expiracao,
          lidaPor: [], reacoes: { '👍': 0, '⚠️': 0, '🔥': 0 },
          palavrasChaveEncontradas: palavrasEncontradas.length > 0 ? palavrasEncontradas : ['geral'],
          localizacao
        });
      }

      if (noticias.length > 0) {
        const batch = db.batch();
        for (const noticia of noticias) {
          const ref = db.collection('noticias').doc();
          batch.set(ref, noticia);
        }
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

coletarNoticias()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro na coleta:', error);
    process.exit(1);
  });
