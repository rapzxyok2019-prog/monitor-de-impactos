// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS - FILTRO REFORÇADO
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 2;
const MIN_PALAVRAS_CHAVE = 2; // Número mínimo de palavras-chave relevantes para salvar

// ===== PALAVRAS-CHAVE OBRIGATÓRIAS (TEMAS RELEVANTES) =====
// A NOTÍCIA PRECISA CONTER PELO MENOS 2 PALAVRAS DESTA LISTA
const PALAVRAS_CHAVE_OBRIGATORIAS = [
  // ===== SEGURANÇA E CRIMINALIDADE =====
  'roubo', 'carga', 'caminhão', 'assalto', 'criminalidade', 'violência',
  'tiroteio', 'confronto', 'operação policial', 'prf', 'blitz',
  'bandido', 'traficante', 'apreensão', 'flagrante', 'investigação',
  'vigilância', 'segurança pública', 'carga roubada',

  // ===== GREVES E PARALISAÇÕES =====
  'greve', 'paralisação', 'caminhoneiro', 'caminhoneiros', 'protesto',
  'bloqueio', 'piquete', 'manifestação', 'travamento',

  // ===== CLIMA =====
  'chuva', 'chuvas', 'enchente', 'alagamento', 'inundação',
  'deslizamento', 'tempestade', 'vendaval', 'tornado', 'furacão',
  'granizo', 'calor', 'clima', 'temperatura', 'frente fria',
  'ciclone', 'temporal', 'ressaca', 'ventania',

  // ===== ACIDENTES =====
  'acidente', 'colisão', 'capotamento', 'engavetamento',
  'atropelamento', 'batida', 'tombamento',

  // ===== TRÂNSITO =====
  'interdição', 'rodovia', 'br-', 'trânsito', 'congestionamento',
  'desvio', 'obras', 'caminhão', 'carreta',

  // ===== LOGÍSTICA E COMBUSTÍVEL =====
  'abastecimento', 'combustível', 'diesel', 'gasolina',
  'transporte', 'entrega', 'carga', 'mercadoria',
  'fábrica', 'produção', 'indústria', 'logística'
];

// ===== PALAVRAS DE BLOQUEIO (DESCARTAR NOTÍCIA) =====
const PALAVRAS_BLOQUEIO = [
  // Política
  'política', 'político', 'eleição', 'voto', 'presidente', 'governo',
  'partido', 'senado', 'câmara', 'deputado', 'senador', 'vereador',
  'ministro', 'governador',

  // Economia geral (sem relação com transporte)
  'inflação', 'ibovespa', 'dólar', 'mercado financeiro', 'bolsa de valores',

  // Esportes
  'futebol', 'campeonato', 'jogador', 'time', 'esporte', 'olimpíada',

  // Entretenimento
  'celebridade', 'famoso', 'artista', 'novela', 'cinema', 'shows',

  // Safras e agronegócio
  'safra', 'soja', 'milho', 'trigo', 'café', 'agronegócio',
  'plantio', 'colheita',

  // Saúde
  'vacina', 'hospital', 'médico', 'tratamento', 'câncer', 'covid'
];

// ===== FONTES DE NOTÍCIAS =====
const FONTES = [
  // ===== PORTAIS NACIONAIS =====
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

  // ===== REGIONAIS ESTRATÉGICOS =====
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
  { nome: 'O Globo - São Paulo', url: 'https://oglobo.globo.com/rss/sao-paulo/', categoria: 'transito' },

  // ===== CLIMA =====
  { nome: 'Meteorologia - Climatempo', url: 'https://www.climatempo.com.br/rss/noticias', categoria: 'clima' }
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
      return [
        'roubo', 'carga', 'assalto', 'greve', 'acidente',
        'chuva', 'interdição', 'PRF', 'blitz', 'caminhoneiro'
      ];
    }
  } catch (error) {
    console.error('❌ Erro ao carregar palavras-chave:', error);
    return [
      'roubo', 'carga', 'assalto', 'greve', 'acidente',
      'chuva', 'interdição', 'PRF', 'blitz', 'caminhoneiro'
    ];
  }
}

// ===== FUNÇÃO: VERIFICAR RELEVÂNCIA (COM CONTAGEM) =====
function isRelevante(titulo, resumo, palavrasChave) {
  const texto = (titulo + ' ' + resumo).toLowerCase();

  // 1. Verifica se tem palavra de bloqueio
  for (const bloqueio of PALAVRAS_BLOQUEIO) {
    if (texto.includes(bloqueio)) {
      return false;
    }
  }

  // 2. Conta quantas palavras-chave relevantes aparecem
  let count = 0;
  for (const palavra of palavrasChave) {
    if (texto.includes(palavra.toLowerCase())) {
      count++;
    }
  }

  // 3. Exige pelo menos MIN_PALAVRAS_CHAVE (2) palavras-chave
  return count >= MIN_PALAVRAS_CHAVE;
}

// ===== FUNÇÃO: DETECTAR CATEGORIA (CORRIGIDA) =====
function detectarCategoria(titulo, resumo) {
  const texto = (titulo + ' ' + resumo).toLowerCase();

  // ===== 1º PRIORIDADE: SEGURANÇA E CRIMINALIDADE =====
  if (texto.includes('roubo') || texto.includes('assalto') ||
      texto.includes('carga') || texto.includes('criminalidade') ||
      texto.includes('violência') || texto.includes('tiroteio') ||
      texto.includes('confronto') || texto.includes('operação policial') ||
      texto.includes('prf') || texto.includes('blitz') ||
      texto.includes('bandido') || texto.includes('traficante') ||
      texto.includes('apreensão') || texto.includes('flagrante') ||
      texto.includes('investigação') || texto.includes('vigilância') ||
      texto.includes('segurança pública') || texto.includes('carga roubada') ||
      texto.includes('incêndio') || texto.includes('fogo') || texto.includes('queimada')) {
    return 'policial';
  }

  // ===== 2º PRIORIDADE: GREVES E PARALISAÇÕES =====
  if (texto.includes('greve') || texto.includes('paralisação') ||
      texto.includes('caminhoneiro') || texto.includes('bloqueio') ||
      texto.includes('protesto') || texto.includes('piquete') ||
      texto.includes('manifestação') || texto.includes('travamento')) {
    return 'greve';
  }

  // ===== 3º PRIORIDADE: CLIMA =====
  if (texto.includes('chuva') || texto.includes('chuvas') || texto.includes('enchente') ||
      texto.includes('alagamento') || texto.includes('inundação') ||
      texto.includes('deslizamento') || texto.includes('tempestade') ||
      texto.includes('vendaval') || texto.includes('tornado') ||
      texto.includes('furacão') || texto.includes('granizo') ||
      texto.includes('calor') || texto.includes('clima') ||
      texto.includes('temperatura') || texto.includes('frente fria') ||
      texto.includes('ciclone') || texto.includes('temporal') ||
      texto.includes('ressaca') || texto.includes('ventania')) {
    return 'clima';
  }

  // ===== 4º PRIORIDADE: ACIDENTES =====
  if (texto.includes('acidente') || texto.includes('colisão') ||
      texto.includes('capotamento') || texto.includes('engavetamento') ||
      texto.includes('atropelamento') || texto.includes('batida') ||
      texto.includes('tombamento')) {
    return 'acidente';
  }

  // ===== 5º PRIORIDADE: TRÂNSITO =====
  if (texto.includes('interdição') || texto.includes('rodovia') ||
      texto.includes('br-') || texto.includes('trânsito') ||
      texto.includes('congestionamento') || texto.includes('desvio') ||
      texto.includes('obras') || texto.includes('caminhão') ||
      texto.includes('carreta')) {
    return 'transito';
  }

  // ===== 6º PRIORIDADE: FÁBRICAS =====
  if (texto.includes('fábrica') || texto.includes('produção') ||
      texto.includes('indústria') || texto.includes('linha de produção') ||
      texto.includes('parada')) {
    return 'fabrica';
  }

  return 'geral';
}

// ===== FUNÇÃO: EXTRAIR CIDADE =====
function extrairCidade(titulo, resumo) {
  const texto = (titulo + ' ' + resumo);
  const cidades = [
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre',
    'Curitiba', 'Brasília', 'Salvador', 'Fortaleza', 'Recife',
    'Manaus', 'Belém', 'Goiânia', 'Campinas', 'Santos',
    'Congonhas', 'Ribeirão Preto', 'São José dos Campos',
    'Uberlândia', 'Contagem', 'Betim', 'Nova Lima',
    'SP', 'RJ', 'MG', 'RS', 'PR', 'DF', 'BA', 'PE', 'CE'
  ];

  for (const cidade of cidades) {
    if (texto.includes(cidade)) {
      return cidade;
    }
  }
  return null;
}

// ===== FUNÇÃO: GEOCODIFICAR =====
async function geocodificar(cidade) {
  const axios = require('axios');
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
  console.log(`📋 Mínimo de ${MIN_PALAVRAS_CHAVE} palavras-chave obrigatórias`);

  initializeApp();
  const db = getFirestore();
  const parser = new Parser();

  const palavrasChave = await carregarPalavrasChave(db);
  if (palavrasChave.length === 0) {
    console.warn('⚠️ Nenhuma palavra-chave configurada. Usando lista padrão.');
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

        // ===== FILTRO REFORÇADO =====
        if (!isRelevante(titulo, resumo, palavrasChave)) {
          console.log(`⏭️ Ignorando: "${titulo.slice(0, 40)}..."`);
          continue;
        }

        // Verifica duplicata
        const existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log(`⏭️ Duplicada: "${titulo.slice(0, 40)}..."`);
          continue;
        }

        const categoria = fonte.categoria !== 'geral' ? fonte.categoria : detectarCategoria(titulo, resumo);
        const expiracao = calcularDataExpiracao();

        const cidade = extrairCidade(titulo, resumo);
        let localizacao = null;
        if (cidade) {
          localizacao = await geocodificar(cidade);
          if (localizacao) {
            console.log(`📍 Localização: ${cidade} → ${localizacao.lat}, ${localizacao.lng}`);
          }
        }

        // Palavras-chave encontradas (para severidade)
        const texto = (titulo + ' ' + resumo).toLowerCase();
        const palavrasEncontradas = [];
        const criticas = ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'interdição', 'enchente', 'PRF', 'blitz'];
        for (const palavra of criticas) {
          if (texto.includes(palavra)) {
            palavrasEncontradas.push(palavra);
          }
        }

        noticias.push({
          titulo,
          resumo,
          link,
          fonte: fonte.nome,
          categoria,
          dataPublicacao: dataPub,
          dataColeta: new Date(),
          dataExpiracao: expiracao,
          lidaPor: [],
          reacoes: { '👍': 0, '⚠️': 0, '🔥': 0 },
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

// ===== EXECUTAR =====
coletarNoticias()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro na coleta:', error);
    process.exit(1);
  });
