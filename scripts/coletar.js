// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS - FOCO EM SEGURANÇA E MONITORAMENTO
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 2;

// ===== PALAVRAS-CHAVE OBRIGATÓRIAS (PELO MENOS UMA) =====
const PALAVRAS_CHAVE_OBRIGATORIAS = [
  // ===== SEGURANÇA E CRIMINALIDADE =====
  'roubo', 'carga', 'caminhão', 'assalto', 'furto', 'carga roubada', 'desvio',
  'criminalidade', 'violência', 'tiroteio', 'confronto', 'operação policial',
  'segurança pública', 'monitoramento', 'vigilância', 'investigação',
  'bandido', 'traficante', 'assaltante', 'ladrão', 'gangue',

  // ===== GREVES E PARALISAÇÕES =====
  'greve', 'paralisação', 'caminhoneiro', 'caminhoneiros', 'protesto', 'bloqueio',

  // ===== TRÂNSITO E RODOVIAS =====
  'interdição', 'rodovia', 'br-', 'trânsito', 'acidente', 'colisão', 'capotamento',

  // ===== CLIMA =====
  'chuva', 'enchente', 'alagamento', 'inundação', 'deslizamento', 'tempestade',
  'calor extremo', 'granizo',

  // ===== LOGÍSTICA E COMBUSTÍVEL =====
  'abastecimento', 'combustível', 'diesel', 'gasolina', 'transporte', 'carga'
];

// ===== PALAVRAS DE BLOQUEIO (SE TIVER, É DESCARTADA) =====
const PALAVRAS_BLOQUEIO = [
  // Política (que não impacta segurança)
  'eleição', 'voto', 'presidente', 'governo', 'partido', 'senado', 'câmara',
  'deputado', 'senador', 'vereador', 'ministro', 'governador',

  // Economia geral (sem relação com segurança)
  'inflação', 'ibovespa', 'dólar', 'mercado financeiro', 'bolsa de valores',

  // Esportes
  'futebol', 'campeonato', 'jogador', 'time', 'esporte', 'olimpíada',

  // Entretenimento
  'celebridade', 'famoso', 'artista', 'novela', 'cinema', 'shows',

  // Safras e agronegócio
  'safra', 'soja', 'milho', 'trigo', 'café', 'agronegócio', 'plantio', 'colheita',

  // Saúde
  'vacina', 'hospital', 'médico', 'tratamento', 'câncer', 'covid', 'pandemia'
];

// ===== FONTES DE NOTÍCIAS (FOCO NACIONAL) =====
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

// ===== FUNÇÃO: VERIFICAR RELEVÂNCIA =====
function isRelevante(titulo, resumo) {
  var texto = (titulo + ' ' + resumo).toLowerCase();

  // Se tiver palavra de bloqueio, descarta
  for (var b = 0; b < PALAVRAS_BLOQUEIO.length; b++) {
    if (texto.indexOf(PALAVRAS_BLOQUEIO[b]) !== -1) {
      return false;
    }
  }

  // Se tiver pelo menos uma palavra obrigatória, salva
  for (var o = 0; o < PALAVRAS_CHAVE_OBRIGATORIAS.length; o++) {
    if (texto.indexOf(PALAVRAS_CHAVE_OBRIGATORIAS[o]) !== -1) {
      return true;
    }
  }

  return false;
}

// ===== FUNÇÃO: EXTRAIR CIDADE =====
function extrairCidade(titulo, resumo) {
  var texto = (titulo + ' ' + resumo);
  var cidades = [
    'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre',
    'Curitiba', 'Brasília', 'Salvador', 'Fortaleza', 'Recife',
    'Manaus', 'Belém', 'Goiânia', 'Campinas', 'Santos',
    'Congonhas', 'Ribeirão Preto', 'São José dos Campos',
    'Uberlândia', 'Contagem', 'Betim', 'Nova Lima',
    'SP', 'RJ', 'MG', 'RS', 'PR', 'DF', 'BA', 'PE', 'CE'
  ];

  for (var i = 0; i < cidades.length; i++) {
    if (texto.indexOf(cidades[i]) !== -1) {
      return cidades[i];
    }
  }
  return null;
}

// ===== FUNÇÃO: DETECTAR CATEGORIA =====
function detectarCategoria(titulo, resumo) {
  var texto = (titulo + ' ' + resumo).toLowerCase();

  // ===== 1º PRIORIDADE: SEGURANÇA =====
  if (texto.indexOf('roubo') !== -1 || texto.indexOf('assalto') !== -1 ||
      texto.indexOf('carga') !== -1 || texto.indexOf('criminalidade') !== -1 ||
      texto.indexOf('violência') !== -1 || texto.indexOf('tiroteio') !== -1 ||
      texto.indexOf('confronto') !== -1 || texto.indexOf('operação policial') !== -1 ||
      texto.indexOf('prf') !== -1 || texto.indexOf('blitz') !== -1) {
    return 'policial';
  }

  // ===== 2º PRIORIDADE: GREVES =====
  if (texto.indexOf('greve') !== -1 || texto.indexOf('paralisação') !== -1 ||
      texto.indexOf('caminhoneiro') !== -1 || texto.indexOf('bloqueio') !== -1 ||
      texto.indexOf('protesto') !== -1) {
    return 'greve';
  }

  // ===== 3º PRIORIDADE: CLIMA (TODAS as palavras de clima) =====
  if (texto.indexOf('vendaval') !== -1 || texto.indexOf('tornado') !== -1 ||
      texto.indexOf('furacão') !== -1 || texto.indexOf('tempestade') !== -1 ||
      texto.indexOf('chuva') !== -1 || texto.indexOf('chuvas') !== -1 ||
      texto.indexOf('enchente') !== -1 || texto.indexOf('alagamento') !== -1 ||
      texto.indexOf('inundação') !== -1 || texto.indexOf('deslizamento') !== -1 ||
      texto.indexOf('granizo') !== -1 || texto.indexOf('calor') !== -1 ||
      texto.indexOf('clima') !== -1 || texto.indexOf('temperatura') !== -1 ||
      texto.indexOf('frente fria') !== -1) {
    return 'clima';
  }

  // ===== 4º PRIORIDADE: ACIDENTES =====
  if (texto.indexOf('acidente') !== -1 || texto.indexOf('colisão') !== -1 ||
      texto.indexOf('capotamento') !== -1 || texto.indexOf('engavetamento') !== -1) {
    return 'acidente';
  }

  // ===== 5º PRIORIDADE: TRÂNSITO (agora em último) =====
  if (texto.indexOf('interdição') !== -1 || texto.indexOf('rodovia') !== -1 ||
      texto.indexOf('br-') !== -1 || texto.indexOf('trânsito') !== -1) {
    return 'transito';
  }

  // ===== 6º PRIORIDADE: FÁBRICAS =====
  if (texto.indexOf('fábrica') !== -1 || texto.indexOf('produção') !== -1 ||
      texto.indexOf('indústria') !== -1) {
    return 'fabrica';
  }

  return 'geral';
}

// ===== FUNÇÃO: CALCULAR EXPIRAÇÃO (2 DIAS) =====
function calcularDataExpiracao() {
  var agora = new Date();
  var expira = new Date(agora);
  expira.setDate(expira.getDate() + 2); // EXATAMENTE 2 DIAS
  return expira;
}

// ===== FUNÇÃO: GEOCODIFICAR =====
function geocodificar(cidade) {
  var axios = require('axios');
  return axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: cidade + ', Brasil', format: 'json', limit: 1 },
    headers: { 'User-Agent': 'Monitor-Frotas-PepsiCo' }
  }).then(function(response) {
    if (response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon),
        cidade: response.data[0].display_name
      };
    }
    return null;
  }).catch(function(error) {
    console.log('⚠️ Erro ao geocodificar "' + cidade + '":', error.message);
    return null;
  });
}

// ===== FUNÇÃO PRINCIPAL =====
async function coletarNoticias() {
  console.log('📡 Iniciando coleta de notícias...');

  initializeApp();
  var parser = new Parser();
  var db = getFirestore();
  var total = 0;

  for (var f = 0; f < FONTES.length; f++) {
    var fonte = FONTES[f];
    try {
      console.log('📡 Coletando: ' + fonte.nome);
      var feed = await parser.parseURL(fonte.url);
      var noticias = [];

      for (var i = 0; i < feed.items.length && i < 8; i++) {
        var item = feed.items[i];
        var titulo = item.title || 'Sem título';
        var resumo = item.contentSnippet || item.description || 'Sem resumo';
        var link = item.link || '#';
        var dataPub = item.pubDate ? new Date(item.pubDate) : new Date();

        // ===== FILTRO DE RELEVÂNCIA =====
        if (!isRelevante(titulo, resumo)) {
          console.log('⏭️ Ignorando notícia irrelevante: "' + titulo.slice(0, 40) + '..."');
          continue;
        }

        // Verifica duplicata
        var existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log('⏭️ Notícia já existe: "' + titulo.slice(0, 40) + '..."');
          continue;
        }

        var categoria = fonte.categoria !== 'geral' ? fonte.categoria : detectarCategoria(titulo, resumo);
        var expiracao = calcularDataExpiracao();

        // Extrai localização
        var cidade = extrairCidade(titulo, resumo);
        var localizacao = null;
        if (cidade) {
          localizacao = await geocodificar(cidade);
          if (localizacao) {
            console.log('📍 Localização encontrada: ' + cidade + ' → ' + localizacao.lat + ', ' + localizacao.lng);
          } else {
            console.log('⚠️ Não foi possível geocodificar: ' + cidade);
          }
        }

        // Extrai palavras-chave encontradas
        var texto = (titulo + ' ' + resumo).toLowerCase();
        var palavrasEncontradas = [];
        var criticas = ['roubo', 'carga', 'assalto', 'greve', 'acidente', 'interdição', 'enchente', 'prf'];
        for (var c = 0; c < criticas.length; c++) {
          if (texto.indexOf(criticas[c]) !== -1) {
            palavrasEncontradas.push(criticas[c]);
          }
        }
        if (palavrasEncontradas.length === 0) {
          var comuns = ['criminalidade', 'violência', 'chuva', 'paralisação', 'bloqueio'];
          for (var k = 0; k < comuns.length; k++) {
            if (texto.indexOf(comuns[k]) !== -1) {
              palavrasEncontradas.push(comuns[k]);
            }
          }
        }

        noticias.push({
          titulo: titulo,
          resumo: resumo,
          link: link,
          fonte: fonte.nome,
          categoria: categoria,
          dataPublicacao: dataPub,
          dataColeta: new Date(),
          dataExpiracao: expiracao,
          lidaPor: [],
          reacoes: { '👍': 0, '⚠️': 0, '🔥': 0 },
          palavrasChaveEncontradas: palavrasEncontradas.length > 0 ? palavrasEncontradas : ['geral'],
          localizacao: localizacao
        });
      }

      if (noticias.length > 0) {
        var batch = db.batch();
        for (var n = 0; n < noticias.length; n++) {
          var ref = db.collection('noticias').doc();
          batch.set(ref, noticias[n]);
        }
        await batch.commit();
        console.log('✅ ' + noticias.length + ' notícias salvas de ' + fonte.nome);
        total += noticias.length;
      }
    } catch (error) {
      console.error('❌ Erro em ' + fonte.nome + ':', error.message);
    }
  }

  console.log('✅ Coleta finalizada! ' + total + ' novas notícias.');
  return total;
}

// ===== EXECUTAR =====
coletarNoticias()
  .then(function() { process.exit(0); })
  .catch(function(error) {
    console.error('❌ Erro na coleta:', error);
    process.exit(1);
  });
