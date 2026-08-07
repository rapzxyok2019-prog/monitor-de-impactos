// ============================================================
// SCRIPT DE COLETA DE NOTÍCIAS (GitHub Actions) - FILTRO REFORÇADO
// ============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');

// ===== CONFIGURAÇÕES =====
const DIAS_PADRAO = 2;

// ===== PALAVRAS-CHAVE RELEVANTES (OBRIGATÓRIAS) =====
// UMA NOTÍCIA PRECISA CONTER PELO MENOS UMA DESTAS PALAVRAS
const PALAVRAS_CHAVE_RELEVANTES = [
  // Greves e paralisações
  'greve', 'paralisação', 'caminhoneiro', 'caminhoneiros',
  
  // Combustível e preços
  'abastecimento', 'combustível', 'diesel', 'gasolina', 'preço',
  
  // Operações policiais
  'operação', 'PRF', 'policial', 'blitz', 'abordagem', 'fiscalização',
  
  // Trânsito e rodovias
  'interdição', 'rodovia', 'BR', 'trânsito', 'acidente', 'colisão',
  'capotamento', 'engavetamento',
  
  // Clima
  'chuva', 'enchente', 'alagamento', 'inundação', 'deslizamento',
  'tempestade', 'granizo', 'calor', 'temperatura', 'clima',
  
  // Logística
  'logística', 'transporte', 'entrega', 'carga', 'mercadoria',
  'fábrica', 'indústria', 'produção'
];

// ===== PALAVRAS-CHAVE DE BLOQUEIO (EXCLUIR NOTÍCIAS) =====
// SE UMA NOTÍCIA CONTIVER ALGUMA DESTAS PALAVRAS, ELA É DESCARTADA
const PALAVRAS_CHAVE_BLOQUEIO = [
  'política', 'político', 'eleição', 'voto', 'presidente', 'governo',
  'partido', 'senado', 'câmara', 'deputado', 'senador', 'vereador',
  'economia', 'inflação', 'ibovespa', 'dólar', 'mercado financeiro',
  'futebol', 'campeonato', 'jogador', 'time', 'esporte',
  'celebridade', 'famoso', 'artista', 'novela', 'entretenimento'
];

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

// ===== FUNÇÃO: VERIFICAR RELEVÂNCIA =====
function isRelevante(titulo, resumo) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  
  // Verifica se tem palavra de bloqueio
  for (var i = 0; i < PALAVRAS_CHAVE_BLOQUEIO.length; i++) {
    if (texto.indexOf(PALAVRAS_CHAVE_BLOQUEIO[i]) !== -1) {
      return false; // Bloqueada
    }
  }
  
  // Verifica se tem palavra relevante
  for (var j = 0; j < PALAVRAS_CHAVE_RELEVANTES.length; j++) {
    if (texto.indexOf(PALAVRAS_CHAVE_RELEVANTES[j]) !== -1) {
      return true; // Relevante
    }
  }
  
  return false; // Não tem nenhuma palavra relevante
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
  if (texto.indexOf('greve') !== -1 || texto.indexOf('paralisação') !== -1) return 'greve';
  if (texto.indexOf('chuva') !== -1 || texto.indexOf('calor') !== -1 || texto.indexOf('clima') !== -1 || texto.indexOf('temperatura') !== -1) return 'clima';
  if (texto.indexOf('interdição') !== -1 || texto.indexOf('trânsito') !== -1 || texto.indexOf('rodovia') !== -1 || texto.indexOf('br-') !== -1) return 'transito';
  if (texto.indexOf('acidente') !== -1 || texto.indexOf('colisão') !== -1 || texto.indexOf('capotamento') !== -1) return 'acidente';
  if (texto.indexOf('PRF') !== -1 || texto.indexOf('policial') !== -1 || texto.indexOf('blitz') !== -1 || texto.indexOf('operação') !== -1) return 'policial';
  if (texto.indexOf('fábrica') !== -1 || texto.indexOf('produção') !== -1 || texto.indexOf('indústria') !== -1) return 'fabrica';
  return 'geral';
}

// ===== FUNÇÃO: CALCULAR EXPIRAÇÃO =====
function calcularDataExpiracao() {
  var agora = new Date();
  var expira = new Date(agora);
  expira.setDate(expira.getDate() + DIAS_PADRAO);
  return expira;
}

// ===== FUNÇÃO: GEOCODIFICAR (USANDO NOMINATIM) =====
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
        var criticas = ['interdição', 'greve', 'acidente', 'enchente', 'vazou', 'paralisação', 'blitz', 'operação', 'PRF'];
        for (var c = 0; c < criticas.length; c++) {
          if (texto.indexOf(criticas[c]) !== -1) {
            palavrasEncontradas.push(criticas[c]);
          }
        }
        if (palavrasEncontradas.length === 0) {
          var comuns = ['chuva', 'calor', 'clima', 'greve', 'paralisação', 'interdição', 'acidente'];
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
