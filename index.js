// ============================================================
// CLOUD FUNCTION - COLETA AUTOMÁTICA DE NOTÍCIAS
// ============================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Parser = require('rss-parser');

admin.initializeApp();
const db = admin.firestore();

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 7;
const DIAS_CRITICO = 15;
const SECRET_TOKEN = 'PepsicoMonitor2026!'; // ← Token de segurança

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

// ===== FUNÇÃO: COLETAR UMA FONTE =====
async function coletarFonte(fonte) {
  const parser = new Parser();
  try {
    console.log(`📡 Coletando: ${fonte.nome}`);
    const feed = await parser.parseURL(fonte.url);
    const noticias = [];

    for (const item of feed.items.slice(0, 8)) {
      const titulo = item.title || 'Sem título';
      const resumo = item.contentSnippet || item.description || 'Sem resumo';
      const link = item.link || '#';
      const dataPub = item.pubDate ? new Date(item.pubDate) : new Date();

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
    }
    return noticias.length;
  } catch (error) {
    console.error(`❌ Erro em ${fonte.nome}:`, error.message);
    return 0;
  }
}

// ===== FUNÇÃO HTTP (chamada pelo cron-job.org) =====
exports.coletarViaHTTP = functions.https.onRequest(async (req, res) => {
  const token = req.query.token || req.body.token;
  if (token !== SECRET_TOKEN) {
    res.status(401).send('❌ Token inválido');
    return;
  }

  console.log('📡 Coleta iniciada via HTTP');
  let total = 0;
  for (const fonte of FONTES) {
    total += await coletarFonte(fonte);
  }
  res.send(`✅ ${total} notícias coletadas`);
});

// ===== FUNÇÃO DE TESTE =====
exports.testarColeta = functions.https.onRequest(async (req, res) => {
  const token = req.query.token || req.body.token;
  if (token !== SECRET_TOKEN) {
    res.status(401).send('❌ Token inválido');
    return;
  }
  let total = 0;
  for (const fonte of FONTES.slice(0, 2)) {
    total += await coletarFonte(fonte);
  }
  res.send(`✅ Teste: ${total} notícias das primeiras 2 fontes`);
});
