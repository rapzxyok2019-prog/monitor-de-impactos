// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS - COM CATEGORIAS DO FIRESTORE
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 2;

// ===== PALAVRAS DE BLOQUEIO =====
const PALAVRAS_BLOQUEIO = [
  'política', 'político', 'eleição', 'voto', 'presidente', 'governo', 'partido', 'senado',
  'câmara', 'deputado', 'senador', 'vereador', 'ministro', 'governador',
  'inflação', 'ibovespa', 'dólar', 'mercado financeiro', 'bolsa de valores',
  'futebol', 'campeonato', 'jogador', 'time', 'esporte',
  'celebridade', 'famoso', 'artista', 'novela', 'cinema',
  'safra', 'soja', 'milho', 'trigo', 'café', 'agronegócio', 'plantio', 'colheita',
  'vacina', 'hospital', 'médico', 'tratamento', 'câncer', 'covid', 'pandemia'
];

// ===== FONTES DE NOTÍCIAS =====
const FONTES = [
  { nome: 'G1 - Geral', url: 'https://g1.globo.com/rss/g1/', categoria: 'geral' },
  { nome: 'G1 - Segurança Pública', url: 'https://g1.globo.com/rss/g1/seguranca/', categoria: 'policial' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'geral' },
  { nome: 'G1 - Rio de Janeiro', url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', categoria: 'geral' },
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'geral' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Folha de SP', url: 'https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml', categoria: 'geral' },
  { nome: 'JP News', url: 'https://jovempan.com.br/feed', categoria: 'geral' },
  { nome: 'Agência Brasil - EBC', url: 'https://www.ebc.com.br/feed', categoria: 'geral' },
  { nome: 'R7 - Notícias', url: 'https://noticias.r7.com/feed.xml', categoria: 'geral' },
  { nome: 'Estadão - Geral', url: 'https://estadao.com.br/rss/geral.xml', categoria: 'geral' }
];

// ===== FUNÇÃO: CARREGAR CATEGORIAS DO FIRESTORE =====
async function carregarCategorias(db) {
  try {
    var snapshot = await db.collection('categorias').get();
    var categorias = [];
    snapshot.forEach(function(doc) {
      var data = doc.data();
      categorias.push({
        nome: data.nome || doc.id,
        palavras: data.palavras || [],
        prioridade: data.prioridade || 999
      });
    });
    // Ordena por prioridade (menor número = maior prioridade)
    categorias.sort(function(a, b) { return a.prioridade - b.prioridade; });
    console.log('📋 Categorias carregadas:', categorias.length);
    return categorias;
  } catch (error) {
    console.error('❌ Erro ao carregar categorias:', error);
    return [];
  }
}

// ===== FUNÇÃO: DETECTAR CATEGORIA =====
function detectarCategoria(titulo, resumo, categorias) {
  var texto = (titulo + ' ' + resumo).toLowerCase();
  
  for (var i = 0; i < categorias.length; i++) {
    var cat = categorias[i];
    for (var j = 0; j < cat.palavras.length; j++) {
      if (texto.indexOf(cat.palavras[j].toLowerCase()) !== -1) {
        return cat.nome;
      }
    }
  }
  
  return 'geral';
}

// ===== FUNÇÃO: VERIFICAR RELEVÂNCIA =====
function isRelevante(titulo, resumo, categorias) {
  var texto = (titulo + ' ' + resumo).toLowerCase();

  // Bloqueio
  for (var b = 0; b < PALAVRAS_BLOQUEIO.length; b++) {
    if (texto.indexOf(PALAVRAS_BLOQUEIO[b]) !== -1) {
      return false;
    }
  }

  // Verifica se tem pelo menos uma palavra de alguma categoria
  for (var i = 0; i < categorias.length; i++) {
    var cat = categorias[i];
    for (var j = 0; j < cat.palavras.length; j++) {
      if (texto.indexOf(cat.palavras[j].toLowerCase()) !== -1) {
        return true;
      }
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
    'SP', 'RJ', 'MG', 'RS', 'PR', 'DF', 'BA', 'PE', 'CE', 'SC', 'GO'
  ];

  for (var i = 0; i < cidades.length; i++) {
    if (texto.indexOf(cidades[i]) !== -1) {
      return cidades[i];
    }
  }
  return null;
}

// ===== FUNÇÃO: CALCULAR EXPIRAÇÃO =====
function calcularDataExpiracao() {
  var agora = new Date();
  var expira = new Date(agora);
  expira.setDate(expira.getDate() + DIAS_PADRAO);
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
  var db = getFirestore();

  // ===== CARREGA AS CATEGORIAS DO FIRESTORE =====
  var categorias = await carregarCategorias(db);
  if (categorias.length === 0) {
    console.log('⚠️ Nenhuma categoria carregada. Usando fallback.');
    return 0;
  }

  var parser = new Parser();
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

        // ===== FILTRO =====
        if (!isRelevante(titulo, resumo, categorias)) {
          console.log('⏭️ Ignorando: "' + titulo.slice(0, 40) + '..."');
          continue;
        }

        // Duplicata
        var existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log('⏭️ Duplicada: "' + titulo.slice(0, 40) + '..."');
          continue;
        }

        var categoria = detectarCategoria(titulo, resumo, categorias);
        var expiracao = calcularDataExpiracao();

        var cidade = extrairCidade(titulo, resumo);
        var localizacao = null;
        if (cidade) {
          localizacao = await geocodificar(cidade);
          if (localizacao) {
            console.log('📍 Localização: ' + cidade + ' → ' + localizacao.lat + ', ' + localizacao.lng);
          }
        }

        // Palavras-chave encontradas (para severidade)
        var texto = (titulo + ' ' + resumo).toLowerCase();
        var palavrasEncontradas = [];
        var criticas = ['interdição', 'greve', 'acidente', 'enchente', 'vazou', 'paralisação', 'blitz', 'operação', 'prf', 'roubo', 'assalto', 'carga'];
        for (var c = 0; c < criticas.length; c++) {
          if (texto.indexOf(criticas[c]) !== -1) {
            palavrasEncontradas.push(criticas[c]);
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
