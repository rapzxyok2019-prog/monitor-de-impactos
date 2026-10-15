// ============================================================
// MONITOR DE IMPACTOS - COLETOR OPERACIONAL v4.0
// ============================================================

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Parser = require('rss-parser');
const axios = require('axios');
const { Resend } = require('resend');

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const DIAS_PADRAO = 2;
const SCORE_ALERTA = 70;
const MAX_NOTICIAS_POR_FONTE = 8;

// ------------------------------------------------------------
// LIMIARES POR CATEGORIA
// ------------------------------------------------------------
const LIMIARES_POR_CATEGORIA = {
  clima:          25,   // sobe fácil, é risco direto
  policial:       30,
  transito:       25,
  greve:          35,
  infraestrutura: 30,
  abastecimento:  30,
  padrao:         40
};

const LIMIAR_EXCECAO_CRITICA = 20;
const FONTES_OFICIAIS = ['inmet', 'cemaden', 'defesa civil', 'defesa_civil', 'crh'];
const LIMIAR_FONTE_OFICIAL = 15;
const LIMIAR_PAINEL_INTERNO = 20;

// Localidades do RJ (pra destaque de risco alto)
const LOCALIDADES_RJ = [
  'rio de janeiro', 'niterói', 'niteroi', 'duque de caxias',
  'nova iguaçu', 'nova iguacu', 'são gonçalo', 'sao goncalo',
  'belford roxo', 'nilópolis', 'nilopolis', 'mesquita',
  'queimados', 'itaboraí', 'itaborai', 'maricá', 'marica',
  'magé', 'mage', 'guapimirim', 'seropédica', 'seropedica'
];

const TERMOS_SEVERIDADE_CRITICA = [
  'extrema', 'extremo', 'grave', 'graves', 'mortes', 'morto', 'morta',
  'vítimas fatais', 'vitimas fatais', 'risco de morte', 'risco iminente',
  'evacuação', 'evacuacao', 'estado de emergência', 'estado de emergencia',
  'desastre', 'catástrofe', 'catastrofe'
];

// ============================================================
// RESEND
// ============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) console.error('❌ RESEND_API_KEY não configurada.');
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const EMAIL_REMETENTE = 'Monitor PepsiCo <onboarding@resend.dev>';
const EMAIL_DESTINATARIOS = ['rapzxyok2019@gmail.com'];

// ============================================================
// PALAVRAS DE BLOQUEIO
// ============================================================

const PALAVRAS_BLOQUEIO = [
  'eleição', 'eleicoes', 'eleições', 'votação', 'votacao', 'partido político', 'partido politico',
  'deputado', 'senador', 'vereador', 'ministro', 'governador',
  'inflação', 'inflacao', 'ibovespa', 'dólar', 'dolar', 'bolsa de valores', 'mercado financeiro',
  'futebol', 'campeonato', 'jogador', 'olimpíada', 'olimpiada',
  'celebridade', 'famoso', 'novela', 'cinema', 'filme', 'série', 'serie', 'música', 'musica',
  'cantor', 'influenciador', 'bbb', 'reality show', 'horóscopo', 'horoscopo',
  'moda', 'fofoca', 'receita', 'entretenimento',
  'safra', 'soja', 'milho', 'trigo', 'café', 'cafe', 'plantio', 'colheita', 'agronegócio',
  'vacina', 'hospital', 'câncer', 'cancer', 'pandemia', 'covid',
  'viralizou', 'viraliza', 'internautas', 'curiosidade',
  
     // Crimes que só mencionam trânsito de passagem (não é operacional)
      'briga de trânsito', 'briga de transito',
      'discussão de trânsito', 'discussao de transito',
      'desentendimento no trânsito', 'desentendimento no transito',
      'crime de trânsito', 'crime de transito',
      'esfaqueado', 'esfaqueada', 'facada',
      'agressão em via', 'agressao em via',
      'briga em via', 'discussão em via', 'discussao em via',
  
   // Aviação civil (não operacional)
  'queda de avião', 'queda de aviao',
  'acidente aéreo', 'acidente aereo',
  'avião', 'aviao', 'aeronave',
  'aeroporto', 'voos', 'voo',
  'companhia aérea', 'companhia aerea',

    // Estatísticas e declarações
  'mortes nas estradas', 'mortes no trânsito', 'mortes no transito',
  'estatística', 'estatistica', 'levantamento', 'balanço', 'balanco',
  'disse que', 'afirmou que', 'declarou',
  'segundo dados', 'de acordo com dados'

];

// ============================================================
// TERMOS DE BAIXA UTILIDADE
// ============================================================

const TERMOS_BAIXA_UTILIDADE = [
  'passageiros comemoram', 'passageiros celebram', 'passageiros se emocionam',
  'passageiros ficam aliviados', 'passageiros relatam', 'passageiros contam',
  'vídeo mostra', 'video mostra', 'vídeo revela', 'video revela',
  'imagens mostram', 'imagens revelam', 'veja o vídeo', 'veja o video',
  'veja imagens', 'repercute nas redes', 'nas redes sociais',
  'momento emocionante', 'momento de tensão', 'momento de tensao',
  'momento de alivio', 'momento de alívio', 'história', 'historia',
  'relato de passageiro', 'relato de passageiros'
];

// ============================================================
// EVENTOS OPERACIONAIS (6 categorias + eventos naturais)
// ============================================================

const EVENTOS_OPERACIONAIS = {

  // ----------------------------------------------------------
  // CLIMA = eventos naturais em geral
  // ----------------------------------------------------------
  clima: {
    palavras: [
      // Chuvas
      'chuva forte', 'chuvas intensas', 'chuvas fortes',
      'temporal', 'tempestade', 'tempestade severa',
      'alagamento', 'alagamentos', 'alagou', 'alaga',
      'enchente', 'inundação', 'inundacao', 'transbordamento',
      'cheia do rio', 'cheia', 'nível do rio', 'nivel do rio',
      'rio subiu', 'rio transbordou', 'rio cheio',

      // Deslizamentos / desabamentos
      'deslizamento', 'desmoronamento', 'desabamento',
      'queda de barreira', 'queda de encosta',

      // Eventos extremos
      'vendaval', 'ventania', 'ciclone', 'tornado', 'furacão', 'furacao',
      'granizo', 'chuva de granizo',
      'ressaca', 'ressaca marítima', 'ressaca maritima',

      // Temperatura
      'onda de calor', 'onda de frio', 'calor extremo', 'frio extremo',
      'geada', 'frente fria', 'frente quente',

      // Outros eventos naturais
      'terremoto', 'tremor de terra', 'tsunami',
      'seca', 'estiagem', 'queimada', 'incêndio florestal', 'incendio florestal',
      'neblina densa', 'névoa densa', 'nevoa densa',

      // Alertas oficiais
      'alerta meteorológico', 'alerta meteorologico',
      'alerta de chuva', 'alerta de tempestade',
      'aviso de tempestade', 'aviso de tempestades',
      'aviso meteorológico', 'aviso meteorologico',
      'defesa civil',

      // Previsão (você pediu pra subir sempre)
      'previsão do tempo', 'previsao do tempo',
      'previsão para hoje', 'previsao para hoje'
    ],
    peso: 32
  },

  // ----------------------------------------------------------
  // POLICIAL = risco operacional por violência/operações
  // ----------------------------------------------------------
  policial: {
    palavras: [
      // Roubo/furto de carga (operação direta)
      'roubo de carga', 'carga roubada', 'furto de carga',
      'assalto a caminhão', 'assalto a caminhao',
      'assalto a carreta', 'roubo de caminhão', 'roubo de caminhao',
      'roubo de carreta', 'desvio de carga', 'carga desviada',

      // Crime organizado (risco imediato em comunidade)
      'facção', 'faccao', 'milícia', 'milicia',
      'pcc', 'comando vermelho', 'crime organizado',
      'guerra do tráfico', 'guerra do trafico',
      'domínio de comunidade', 'dominio de comunidade',
    
      // Operações que bloqueiam vias
      'operação policial', 'operacao policial',
      'operação da prf', 'operacao da prf',
      'blitz', 'barreira policial', 'perseguição', 'perseguicao',
      'confronto', 'tiroteio',
      'operação em comunidade', 'operacao em comunidade',

      // Risco imediato em via
      'arrastão', 'arrastao', 'saque', 'saques',
      'depredação', 'depredacao',
      'ônibus queimado', 'onibus queimado',
      'veículo queimado', 'veiculo queimado',
      'carro queimado', 'caminhão queimado', 'caminhao queimado',
      'barricada', 'tumulto',

      // Incidentes com impacto logístico
      'incêndio em galpão', 'incendio em galpao',
      'incêndio em depósito', 'incendio em deposito',
      'incêndio em caminhão', 'incendio em caminhao',
      'incêndio em carreta', 'incendio em carreta'
    ],
    peso: 30
  },

  // ----------------------------------------------------------
  // TRÂNSITO = bloqueio de via, acidente que trava, etc.
  // ----------------------------------------------------------
   transito: {
    palavras: [
      // Interdições e bloqueios explícitos
      'interdição', 'interdicao', 'interditada', 'interditado',
      'bloqueio de pista', 'pista fechada', 'pista bloqueada',
      'faixa bloqueada', 'faixa interditada',
      'rodovia fechada', 'rodovia interditada',
      'avenida fechada', 'avenida interditada',
      'rua fechada', 'rua interditada',
      'trânsito parado', 'transito parado',
      'trânsito bloqueado', 'transito bloqueado',
      'trânsito interditado', 'transito interditado',
      'congestionamento', 'lentidão', 'lentidao',
      'desvio', 'rota alternativa',

      // Acidentes que travam via
      'engavetamento', 'capotamento',
      'carreta tombou', 'caminhão tombou', 'caminhao tombou',
      'caminhão capotou', 'caminhao capotou',
      'carreta capotou', 'veículo capotou', 'veiculo capotou',
      'tombamento', 'tombou',
      'colisão', 'colisao',
      'acidente na rodovia', 'acidente na br',
      'acidente na avenida', 'acidente na pista',
      'acidente com caminhão', 'acidente com caminhao',
      'acidente com carreta', 'acidente com ônibus', 'acidente com onibus'
    ],
    peso: 25
  },

  // ----------------------------------------------------------
  // GREVE = caminhoneiros, fábrica, etc.
  // ----------------------------------------------------------
  greve: {
    palavras: [
      'greve', 'greve geral',
      'greve de caminhoneiros', 'greve dos caminhoneiros',
      'greve de funcionários', 'greve de funcionarios',
      'greve em fábrica', 'greve em fabrica',
      'greve em indústria', 'greve em industria',
      'paralisação', 'paralisacao',
      'paralisação de caminhoneiros', 'paralisacao de caminhoneiros',
      'paralisação de transporte', 'paralisacao de transporte',
      'paralisação em fábrica', 'paralisacao em fabrica',
      'caminhoneiros', 'caminhoneiro',
      'piquete', 'bloqueio de rodovia', 'travamento'
    ],
    peso: 30
  },

  // ----------------------------------------------------------
  // INFRAESTRUTURA = falhas estruturais
  // ----------------------------------------------------------
  infraestrutura: {
    palavras: [
      'falta de energia', 'apagão', 'apagao',
      'queda de energia', 'interrupção de energia', 'interrupcao de energia',
      'queda de ponte', 'ponte interditada', 'ponte desabou',
      'rompimento de barragem', 'barragem rompeu',
      'explosão', 'explosao',
      'vazamento de gás', 'vazamento de gas',
      'vazamento de produto químico', 'vazamento de produto quimico',
      'queda de torre', 'queda de poste',
      'desabamento de estrutura'
    ],
    peso: 25
  },

  // ----------------------------------------------------------
  // ABASTECIMENTO = combustível
  // ----------------------------------------------------------
  abastecimento: {
    palavras: [
      'falta de combustível', 'falta de combustivel',
      'crise de combustível', 'crise de combustivel',
      'desabastecimento',
      'greve de combustível', 'greve de combustivel',
      'aumento do diesel', 'aumento da gasolina',
      'posto sem combustível', 'posto sem combustivel'
    ],
    peso: 25
  }

};

// ============================================================
// TERMOS DE IMPACTO
// ============================================================

const TERMOS_IMPACTO = [
  'interdição', 'interdicao', 'interditado', 'interditada',
  'bloqueio', 'bloqueada', 'bloqueado',
  'evacuação', 'evacuacao', 'desvio', 'congestionamento',
  'lentidão', 'lentidao', 'pista fechada', 'pista interditada',
  'trânsito parado', 'transito parado',
  'trânsito intenso', 'transito intenso',
  'sem acesso', 'acesso bloqueado', 'rota alternativa',
  'paralisação', 'paralisacao',
  'operação suspensa', 'operacao suspensa',
  'operações suspensas', 'operacoes suspensas',
  'atividade suspensa', 'atividades suspensas',
  'serviço interrompido', 'servico interrompido',
  'serviços interrompidos', 'servicos interrompidos',
  'acesso restrito', 'acesso interditado',
  'circulação interrompida', 'circulacao interrompida',
  'circulação proibida', 'circulacao proibida'
];

const TERMOS_IMPACTO_FORTE = [
  'interdição total', 'interdicao total', 'bloqueio total',
  'pista totalmente bloqueada',
  'operações suspensas', 'operacoes suspensas',
  'fábrica parada', 'fabrica parada',
  'produção parada', 'producao parada',
  'evacuação', 'evacuacao', 'rompimento'
];

// ============================================================
// LOCALIDADES MONITORADAS
// ============================================================

const LOCALIDADES_MONITORADAS = [
  'são paulo', 'sao paulo', 'campinas', 'itu', 'sorocaba', 'jundiaí', 'jundiai',
  'santos', 'indaiatuba', 'salto', 'itupeva', 'americana', 'limeira',
  'piracicaba', 'sumaré', 'sumare', 'hortolândia', 'hortolandia',
  'guarulhos', 'osasco', 'barueri', 'são bernardo do campo', 'sao bernardo do campo',
  'santo andré', 'santo andre', 'diadema', 'mauá', 'maua',
  'são caetano', 'sao caetano', 'ribeirão preto', 'ribeirao preto',
  'são josé dos campos', 'sao jose dos campos', 'bauru', 'marília', 'marilia',
  'presidente prudente',
  'belo horizonte', 'contagem', 'betim', 'uberlândia', 'uberlandia',
  'nova lima', 'juiz de fora', 'montes claros', 'governador valadares',
  'curitiba', 'são josé dos pinhais', 'sao jose dos pinhais',
  'londrina', 'maringá', 'maringa', 'ponta grossa', 'cascavel',
  'foz do iguaçu', 'foz do iguacu',
  'rio de janeiro', 'niterói', 'niteroi', 'duque de caxias',
  'nova iguaçu', 'nova iguacu',
  'porto alegre', 'canoas', 'caxias do sul', 'florianópolis', 'florianopolis',
  'joinville', 'blumenau',
  'brasília', 'brasilia', 'goiânia', 'goiania', 'cuiabá', 'cuiaba', 'campo grande',
  'salvador', 'feira de santana', 'recife', 'caruaru', 'fortaleza',
  'juazeiro do norte', 'natal', 'joão pessoa', 'joao pessoa',
  'maceió', 'maceio', 'aracaju', 'teresina', 'são luís', 'sao luis',
  'campina grande',
  'manaus', 'belém', 'belem', 'palmas', 'porto velho', 'rio branco',
  'macapá', 'macapa', 'boa vista'
];

// ============================================================
// RODOVIAS MONITORADAS
// ============================================================

const RODOVIAS_MONITORADAS = [
  'castello branco', 'castelo branco', 'anhanguera', 'bandeirantes',
  'raposo tavares', 'régis bittencourt', 'regis bittencourt',
  'imigrantes', 'anchieta', 'rodoanel', 'dom pedro',
  'washington luís', 'washington luis', 'marechal rondon',
  'carvalho pinto', 'ayrton senna', 'jacú pêssego', 'jacu pessego',
  'sp-021', 'sp-160', 'sp-270', 'sp-280', 'sp-330', 'sp-348',
  'sp-150', 'sp-099', 'sp-055', 'sp-065',
  'br-101', 'br-116', 'br-040', 'br-050', 'br-060', 'br-070', 'br-080',
  'br-153', 'br-158', 'br-163', 'br-210', 'br-222', 'br-226', 'br-230',
  'br-232', 'br-235', 'br-242', 'br-251', 'br-259', 'br-262', 'br-265',
  'br-267', 'br-277', 'br-280', 'br-282', 'br-290', 'br-304', 'br-307',
  'br-316', 'br-317', 'br-319', 'br-324', 'br-356', 'br-364', 'br-365',
  'br-369', 'br-373', 'br-376', 'br-381', 'br-386', 'br-392', 'br-402',
  'br-403', 'br-404', 'br-407', 'br-408', 'br-414', 'br-415', 'br-418',
  'br-420', 'br-422', 'br-423', 'br-424', 'br-425', 'br-428', 'br-429',
  'br-430', 'br-432', 'br-436', 'br-448', 'br-452', 'br-454', 'br-459',
  'br-463', 'br-465', 'br-467', 'br-469', 'br-470', 'br-471', 'br-472',
  'br-476', 'br-480', 'br-481', 'br-482', 'br-483', 'br-484', 'br-485',
  'br-486', 'br-487', 'br-488', 'br-489', 'br-490', 'br-491', 'br-492',
  'br-493', 'br-494', 'br-495', 'br-496', 'br-497', 'br-498', 'br-499',
  'fernão dias', 'fernao dias', 'mg-050', 'mg-030', 'mg-010',
  'pr-092', 'pr-151', 'pr-323',
  'rs-118', 'rs-122', 'rs-239', 'rs-240',
  'sc-108', 'sc-401', 'sc-405',
  'ba-093', 'ba-099', 'ba-148', 'ba-156',
  'pe-001', 'pe-008', 'pe-015',
  'ce-010', 'ce-040', 'ce-085',
  'go-010', 'go-020', 'go-060',
  'ms-040', 'ms-060', 'ms-112'
];

// ============================================================
// FONTES DE NOTÍCIAS
// ============================================================

const FONTES = [
  { nome: 'G1 - Segurança Pública', url: 'https://g1.globo.com/rss/g1/seguranca/', categoria: 'policial' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'geral' },
  { nome: 'G1 - Campinas', url: 'https://g1.globo.com/rss/g1/sp/campinas-regiao/', categoria: 'geral' },
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'geral' },
  { nome: 'G1 - Paraná', url: 'https://g1.globo.com/rss/g1/pr/parana/', categoria: 'geral' },
  { nome: 'G1 - Rio de Janeiro', url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', categoria: 'geral' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/geral/feed.xml', categoria: 'geral' },
  { nome: 'INMET - Alertas', url: 'http://alert-as.inmet.gov.br/cap_12/rss/alert-as.rss', categoria: 'clima' },
  { nome: 'CEMADEN - Alertas', url: 'http://www.cemaden.gov.br/feed/', categoria: 'clima' },
  { nome: 'Portal do Trânsito', url: 'https://www.portaldotransito.com.br/feed/', categoria: 'transito' }
];
// ============================================================
// NORMALIZAÇÃO E UTILITÁRIOS
// ============================================================

function normalizar(texto) {
  return (texto || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function contem(texto, palavras) {
  return palavras.some(p => texto.includes(normalizar(p)));
}

// ============================================================
// DETECTAR LOCALIDADE
// ============================================================

function detectarLocalidade(titulo, resumo) {
  const texto = normalizar(`${titulo} ${resumo}`);
  for (const local of LOCALIDADES_MONITORADAS) {
    if (texto.includes(normalizar(local))) return local;
  }
  return null;
}

function ehLocalidadeRJ(localidade) {
  if (!localidade) return false;
  const loc = normalizar(localidade);
  return LOCALIDADES_RJ.some(rj => loc.includes(normalizar(rj)));
}

// ============================================================
// DETECTAR RODOVIA
// ============================================================

function detectarRodovia(titulo, resumo) {
  const texto = normalizar(`${titulo} ${resumo}`);
  for (const rodovia of RODOVIAS_MONITORADAS) {
    if (texto.includes(normalizar(rodovia))) return rodovia;
  }
  return null;
}

// ============================================================
// DETECTAR BAIXA UTILIDADE
// ============================================================

function detectarBaixaUtilidade(texto) {
  const encontrados = [];
  for (const termo of TERMOS_BAIXA_UTILIDADE) {
    if (texto.includes(normalizar(termo))) encontrados.push(termo);
  }
  return encontrados;
}

// ============================================================
// CALCULAR RELEVÂNCIA
// ============================================================

function calcularRelevancia(titulo, resumo, fonte) {

  const texto = normalizar(`${titulo} ${resumo}`);
  let score = 0;
  const motivos = [];

  // ==========================================================
  // 1. BLOQUEIO
  // ==========================================================
  for (const bloqueio of PALAVRAS_BLOQUEIO) {
    if (texto.includes(normalizar(bloqueio))) {
      score -= 60;
      motivos.push(`bloqueio: ${bloqueio}`);
      break;
      
    }
  }

  // ==========================================================
  // 2. ÂNCORAS — o "assunto real" (usa EVENTOS_OPERACIONAIS)
  // ==========================================================
 const ancorasEncontradas = [];
  for (const [tema, config] of Object.entries(EVENTOS_OPERACIONAIS)) {
    const palavrasQueBateram = config.palavras.filter(p => texto.includes(normalizar(p)));
    if (palavrasQueBateram.length > 0) {
      ancorasEncontradas.push(tema);
      score += config.peso;
      motivos.push(`âncora: ${tema} (${palavrasQueBateram.slice(0, 3).join(', ')})`);
    }
  }

  // ==========================================================
  // 3. CONTEXTOS — onde/como (confirma operação real)
  // ==========================================================
  const contextos = {
    via: [
      'rodovia', 'avenida', 'rua', 'pista', 'estrada',
      'br-', 'sp-', 'mg-', 'pr-', 'rs-', 'sc-', 'ba-', 'pe-', 'ce-', 'go-', 'ms-',
      'castello branco', 'castelo branco', 'anhanguera', 'bandeirantes',
      'régis bittencourt', 'regis bittencourt', 'imigrantes', 'anchieta',
      'rodoanel', 'fernão dias', 'fernao dias'
    ],
    impacto: [
      'interdição', 'interdicao', 'interditada', 'interditado',
      'bloqueio', 'bloqueada', 'bloqueado', 'desvio',
      'evacuação', 'evacuacao',
      'paralisação', 'paralisacao',
      'operação suspensa', 'operacao suspensa',
      'serviço interrompido', 'servico interrompido',
      'circulação interrompida', 'circulacao interrompida',
      'circulação proibida', 'circulacao proibida'
    ],
    severidade: [
      'mortes', 'morto', 'morta', 'vítimas fatais', 'vitimas fatais',
      'grave', 'graves', 'extrema', 'extremo',
      'desastre', 'catástrofe', 'catastrofe', 'risco iminente'
    ]
  };

  const contextosEncontrados = [];
  for (const [tipo, palavras] of Object.entries(contextos)) {
    const bateu = palavras.some(p => texto.includes(normalizar(p)));
    if (bateu) {
      contextosEncontrados.push(tipo);
      score += 15;
      motivos.push(`contexto: ${tipo}`);
    }
  }

  // ==========================================================
  // 4. LOCALIDADE E RODOVIA
  // ==========================================================
  const localidade = detectarLocalidade(titulo, resumo);
  if (localidade) {
    score += 15;
    motivos.push(`localidade: ${localidade}`);
  }

  const rodovia = detectarRodovia(titulo, resumo);
  if (rodovia) {
    score += 20;
    motivos.push(`rodovia: ${rodovia}`);
  }

   // ==========================================================
  // 5. REGRA DE OPERACIONAL REAL
  // ==========================================================
  const temAncora = ancorasEncontradas.length > 0;
  const temLocalidadeOuRodovia = !!localidade || !!rodovia;

  // Contexto REAL (não genérico)
  const temContextoReal = 
    contextosEncontrados.includes('via') || 
    contextosEncontrados.includes('impacto');

  // Categorias que podem liberar SOZINHAS (mesmo sem via/impacto)
  const categoriaCritica = 
    ancorasEncontradas.includes('clima') ||
    (ancorasEncontradas.includes('policial') && ehLocalidadeRJ(localidade));

  let operacionalReal = false;

  if (temAncora && temContextoReal) {
    // Regra 1: âncora + via/impacto
    operacionalReal = true;
  } else if (temAncora && categoriaCritica) {
    // Regra 2: clima OU policial no RJ
    operacionalReal = true;
  } else if (temAncora && temLocalidadeOuRodovia && ancorasEncontradas.length >= 2) {
    // Regra 3: âncora + localidade/rodovia + 2+ âncoras
    operacionalReal = true;
  } else if (temAncora && !temContextoReal && !categoriaCritica) {
    // Âncora sozinha sem contexto real → penaliza
    score -= 20;
    motivos.push('âncora sem contexto real');
  }
  // ==========================================================
  // 6. BAIXA UTILIDADE
  // ==========================================================
  const baixaUtilidade = detectarBaixaUtilidade(texto);
  if (baixaUtilidade.length > 0) {
    score -= 5 * baixaUtilidade.length;
    motivos.push(`conteúdo secundário: ${baixaUtilidade.join(', ')}`);
  }

  // ==========================================================
  // 7. FONTE ESPECIALIZADA
  // ==========================================================
  const fonteNormalizada = normalizar(fonte);
  if (fonteNormalizada.includes('seguranca') || fonteNormalizada.includes('policia')) {
    score += 10;
    motivos.push('fonte especializada');
  }

  // ==========================================================
  // 8. LIMITAR + NÍVEL
  // ==========================================================
  score = Math.max(0, Math.min(100, score));

  let nivel = 'DESCARTAR';
  if (score >= 85) nivel = 'CRÍTICO';
  else if (score >= 70) nivel = 'ALTO';
  else if (score >= 40) nivel = 'MONITORAR';

  return {
    score,
    nivel,
    ancoras: ancorasEncontradas,
    contextos: contextosEncontrados,
    localidade,
    rodovia,
    operacionalReal,
    baixaUtilidade,
    motivos
  };
}

// ============================================================
// CATEGORIA — por PONTUAÇÃO COM CONTEXTO
// ============================================================

function determinarCategoria(analise, texto) {

  const t = normalizar(texto || '');
  const temPalavra = (lista) => lista.some(p => t.includes(normalizar(p)));

  const pontos = {
    clima: 0,
    policial: 0,
    transito: 0,
    greve: 0,
    infraestrutura: 0,
    abastecimento: 0
  };

  // ----------------------------------------------------------
  // 1. PESO POR ÂNCORA
  // ----------------------------------------------------------
  analise.ancoras.forEach(ancora => {
    const peso = EVENTOS_OPERACIONAIS[ancora] ? EVENTOS_OPERACIONAIS[ancora].peso : 0;
    if (ancora === 'clima')           pontos.clima += peso;
    if (ancora === 'policial' || ancora === 'seguranca') pontos.policial += peso;
    if (ancora === 'transito')        pontos.transito += peso;
    if (ancora === 'greve')           pontos.greve += peso;
    if (ancora === 'infraestrutura')  pontos.infraestrutura += peso;
    if (ancora === 'abastecimento')   pontos.abastecimento += peso;
  });

  // ----------------------------------------------------------
  // 2. BÔNUS POR CONTEXTO
  // ----------------------------------------------------------
  const ctx = analise.contextos || [];
  if (ctx.includes('via')) {
    pontos.transito += 20;
    pontos.greve += 10;
  }
  if (ctx.includes('impacto')) {
    pontos.transito += 15;
    pontos.infraestrutura += 10;
  }
  if (ctx.includes('severidade')) {
    let maior = 0;
    for (const c in pontos) if (pontos[c] > maior) maior = pontos[c];
    for (const c in pontos) if (pontos[c] === maior) pontos[c] += 15;
  }

  // ----------------------------------------------------------
  // 3. REFORÇO POR CONTEXTO REAL NO TEXTO
  // ----------------------------------------------------------

  // CLIMA: só confirma se tiver evento climático real
  const temClimaReal = temPalavra([
    'alaga', 'inunda', 'enchente', 'cheia', 'transbord',
    'desliza', 'desmorona', 'destelha',
    'vendaval', 'ventania', 'granizo', 'ciclone', 'tornado', 'furac',
    'chuva forte', 'chuva intensa', 'temporal', 'tempestade',
    'alerta meteorol', 'aviso meteorol', 'defesa civil',
    'nível do rio', 'nivel do rio', 'rio subiu', 'rio transbordou',
    'previsão do tempo', 'previsao do tempo',
    'onda de calor', 'onda de frio', 'seca', 'estiagem',
    'queimada', 'incêndio florestal', 'incendio florestal',
    'terremoto', 'tremor', 'neblina', 'névoa', 'nevoa'
  ]);
  if (!temClimaReal && pontos.clima > 0) {
    pontos.clima = Math.max(0, pontos.clima - 20);
  }

  // POLICIAL: precisa contexto real
  const temPolicialReal = temPalavra([
    'roubo de carga', 'carga roubada', 'furto de carga',
    'assalto a caminh', 'roubo de caminh', 'roubo de carreta',
    'facção', 'faccao', 'milícia', 'milicia', 'pcc', 'comando vermelho',
    'operação policial', 'operacao policial',
    'confronto', 'tiroteio', 'arrastão', 'arrastao',
    'ônibus queimado', 'onibus queimado', 'toque de recolher', 'domínio de comunidade', 'dominio de comunidade',
    'guerra do tráfico', 'guerra do trafico', 'roubada', 'roubadas', 'roubado', 'roubados',
      'assaltada', 'assaltadas', 'assaltado', 'assaltados',
      'roubaram', 'assaltaram', 'carga roubada', 'carga foi roubada',
  ]);
  if (!temPolicialReal && pontos.policial > 0) {
    pontos.policial = Math.max(0, pontos.policial - 20);
  }

  // TRANSiTO: precisa contexto real
  const temTransitoReal = temPalavra([
    'interdi', 'bloqueio', 'pista fechada', 'pista bloqueada',
    'rodovia fechada', 'rodovia interditada',
    'acidente', 'colis', 'capota', 'engaveta', 'atropel',
    'tombamento', 'tombou', 'congestionamento', 'desvio', 'rota alternativa'
  ]);
  if (!temTransitoReal && pontos.transito > 0) {
    pontos.transito = Math.max(0, pontos.transito - 15);
  }

  // GREVE: precisa contexto real
  const temGreveReal = temPalavra([
    'greve', 'paralisação', 'paralisacao', 'piquete',
    'caminhoneir', 'bloqueio de rodovia', 'travamento'
  ]);
  if (!temGreveReal && pontos.greve > 0) {
    pontos.greve = Math.max(0, pontos.greve - 20);
  }

  // ----------------------------------------------------------
  // 4. ESCOLHE VENCEDOR
  // ----------------------------------------------------------
  let melhor = 'geral';
  let maior = 0;
  for (const cat in pontos) {
    if (pontos[cat] > maior) {
      maior = pontos[cat];
      melhor = cat;
    }
  }
  if (maior === 0) return 'geral';

  // ==========================================================
  // DESEMPATES — prioridades específicas
  // ==========================================================

  // Abastecimento vence se for o maior ou empatar
  if (pontos.abastecimento > 0 && pontos.abastecimento >= maior - 3) {
    return 'abastecimento';
  }

  // Clima vence se for o maior ou empatar com transito/policial
  if (pontos.clima > 0 && pontos.clima >= maior - 3 &&
      pontos.clima >= pontos.transito - 3 && pontos.clima >= pontos.policial - 3) {
    return 'clima';
  }
  
  return melhor;
}

// ============================================================
// DETECTAR SEVERIDADE CRÍTICA
// ============================================================

function detectarSeveridadeCritica(texto, analise) {
  if (analise.nivel === 'CRÍTICO') return true;
  if (analise.baixaUtilidade && analise.baixaUtilidade.length > 0) return false;
  return TERMOS_SEVERIDADE_CRITICA.some(t => texto.includes(normalizar(t)));
}

// ============================================================
// DECIDIR PUBLICAÇÃO
// ============================================================

function decidirPublicacao(texto, analise, categoria, fonte) {
  const cat = (categoria || 'geral').toLowerCase();
  const limiar = LIMIARES_POR_CATEGORIA[cat] ?? LIMIARES_POR_CATEGORIA.padrao;
  const fonteNorm = normalizar(fonte);
  const fonteOficial = FONTES_OFICIAIS.some(f => fonteNorm.includes(normalizar(f)));
  const severidadeCritica = detectarSeveridadeCritica(texto, analise);
  const riscoAlto = (cat === 'policial' && ehLocalidadeRJ(analise.localidade));

  // ==========================================================
  // REGRA DE CONTEXTO: sem operacionalReal não sobe
  // ==========================================================
  if (!analise.operacionalReal && !fonteOficial && !severidadeCritica && !riscoAlto) {
    if (analise.score >= LIMIAR_PAINEL_INTERNO) {
      return {
        status: 'painel_interno',
        motivo: 'Sem contexto operacional — fica no painel interno.',
        limiarUsado: LIMIAR_PAINEL_INTERNO,
        severidadeCritica,
        riscoAlto
      };
    }
    return {
      status: 'nao_publicar',
      motivo: 'Sem âncora ou contexto operacional.',
      limiarUsado: limiar,
      severidadeCritica,
      riscoAlto
    };
  }

  // 1. Regra normal
  if (analise.score >= limiar) {
    return {
      status: 'publicar',
      motivo: `Score ${analise.score} >= limiar ${limiar} (${cat}).`,
      limiarUsado: limiar,
      severidadeCritica,
      riscoAlto
    };
  }

  // 2. Exceção para evento crítico
  if (severidadeCritica && analise.score >= LIMIAR_EXCECAO_CRITICA) {
    return {
      status: 'publicar_atencao',
      motivo: `Evento crítico com score ${analise.score}.`,
      limiarUsado: LIMIAR_EXCECAO_CRITICA,
      severidadeCritica,
      riscoAlto
    };
  }

  // 3. Fonte oficial
  if (fonteOficial && analise.score >= LIMIAR_FONTE_OFICIAL) {
    return {
      status: 'publicar_atencao',
      motivo: `Fonte oficial "${fonte}" com score ${analise.score}.`,
      limiarUsado: LIMIAR_FONTE_OFICIAL,
      severidadeCritica,
      riscoAlto
    };
  }

  // 4. Risco alto (policial RJ) mesmo com score baixo
  if (riscoAlto && analise.score >= LIMIAR_EXCECAO_CRITICA) {
    return {
      status: 'publicar_atencao',
      motivo: `Policial no RJ — risco alto pra operação.`,
      limiarUsado: LIMIAR_EXCECAO_CRITICA,
      severidadeCritica,
      riscoAlto
    };
  }

  // 5. Painel interno
  if (analise.score >= LIMIAR_PAINEL_INTERNO) {
    return {
      status: 'painel_interno',
      motivo: `Score ${analise.score} abaixo do limiar público.`,
      limiarUsado: LIMIAR_PAINEL_INTERNO,
      severidadeCritica,
      riscoAlto
    };
  }

  // 6. Não publicar
  return {
    status: 'nao_publicar',
    motivo: `Score ${analise.score} abaixo de todos os limiares.`,
    limiarUsado: limiar,
    severidadeCritica,
    riscoAlto
  };
}

// ============================================================
// GEOCODIFICAÇÃO
// ============================================================

async function geocodificar(cidade) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: `${cidade}, Brasil`, format: 'json', limit: 1 },
      headers: { 'User-Agent': 'Monitor-Impactos-PepsiCo/4.0' },
      timeout: 10000
    });
    if (response.data && response.data.length > 0) {
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

// ============================================================
// EXPIRAÇÃO
// ============================================================

function calcularDataExpiracao(categoria, severidadeCritica) {
  const agora = new Date();
  const expira = new Date(agora);

  let dias = DIAS_PADRAO;
  if (categoria === 'greve') dias = 20;
  else if (categoria === 'policial' || categoria === 'transito') dias = 15;
  else if (categoria === 'clima') dias = 7;
  if (severidadeCritica) dias = Math.max(dias, 15);

  expira.setDate(expira.getDate() + dias);
  return expira;
}

// ============================================================
// ENVIAR RESUMO POR E-MAIL
// ============================================================

async function enviarResumo(noticiasCriticas) {

  if (noticiasCriticas.length === 0) {
    console.log('📧 Nenhuma notícia de alto impacto.');
    return;
  }

  if (!resend) {
    console.error('❌ E-mail não enviado: RESEND_API_KEY não configurada.');
    return;
  }

  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const total = noticiasCriticas.length;

  const contagemCategorias = {};
  for (const noticia of noticiasCriticas) {
    const categoria = noticia.categoria || 'geral';
    contagemCategorias[categoria] = (contagemCategorias[categoria] || 0) + 1;
  }

  const emojis = {
    clima: '🌧️', policial: '🚔', transito: '🚧',
    greve: '🚛', infraestrutura: '🏗️', abastecimento: '⛽', geral: '📌'
  };

  let listaCategorias = '';
  for (const [categoria, quantidade] of Object.entries(contagemCategorias)) {
    const emoji = emojis[categoria] || '📌';
    listaCategorias += `<li><strong>${emoji} ${categoria}</strong>: ${quantidade}</li>`;
  }

  const linkSite = 'https://rapzxyok2019-prog.github.io/monitor-de-impactos/';
  const assunto = `🚨 ${total} alerta(s) operacional(is) - Monitor PepsiCo`;

  const mensagemHtml = `
    <h2 style="color:#003da5;">🚛 Monitor de Impactos - PepsiCo</h2>
    <p><strong>Data/Hora:</strong> ${dataHora}</p>
    <p style="font-size:1.3rem;"><strong>📊 Total de alertas:</strong> ${total}</p>
    <div style="background:#eef2f6; padding:12px; border-radius:8px; margin:12px 0;">
      <h4 style="margin:0;">📋 Resumo por categoria</h4>
      <ul style="margin:8px 0 0 0; padding-left:20px;">${listaCategorias}</ul>
    </div>
    <p style="margin:16px 0;">
      <a href="${linkSite}" target="_blank"
         style="background:#003da5; color:white; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:bold;">
        🔍 Ver no Monitor
      </a>
    </p>
    <hr style="margin:24px 0; border:none; border-top:1px solid #e2e6ee;">
    <p style="color:#6b7a93; font-size:0.8rem;">Enviado automaticamente pelo Monitor de Impactos.</p>
  `;

  try {
    for (const destinatario of EMAIL_DESTINATARIOS) {
      const resultado = await resend.emails.send({
        from: EMAIL_REMETENTE,
        to: [destinatario],
        subject: assunto,
        html: mensagemHtml
      });
      if (resultado.error) {
        console.error(`❌ Erro ao enviar para ${destinatario}:`, resultado.error.message);
      } else {
        console.log(`📧 Alerta enviado para ${destinatario} (${total} notícias)`);
      }
    }
  } catch (error) {
    console.error('❌ Erro no envio:', error.message);
  }
}

// ============================================================
// COLETA PRINCIPAL
// ============================================================

async function coletarNoticias() {

  console.log('📡 Iniciando Monitor de Impactos v4.0...');

  if (getApps().length === 0) initializeApp();
  const db = getFirestore();
  const parser = new Parser();

  let total = 0;
  const noticiasCriticas = [];

  for (const fonte of FONTES) {
    try {
      console.log(`\n📡 ${fonte.nome}`);
      const feed = await parser.parseURL(fonte.url);

      for (const item of feed.items.slice(0, MAX_NOTICIAS_POR_FONTE)) {
        const titulo = item.title || 'Sem título';
        const resumo = item.contentSnippet || item.content || item.description || '';
        const link = item.link || '#';
        const dataPub = item.pubDate ? new Date(item.pubDate) : new Date();

// ----------------------------------------------------------
// FILTRO DE DATA: ignora notícias com mais de 2 dias
// ----------------------------------------------------------
const agora = new Date();
const idadeHoras = (agora - dataPub) / (1000 * 60 * 60);

if (idadeHoras > 48) {
  console.log(`📰 ${titulo.slice(0, 70)}`);
  console.log(`   ⏰ Antiga (${Math.round(idadeHoras)}h) — IGNORADA`);
  continue;
}

console.log(`📰 ${titulo.slice(0, 70)}`);
        console.log(`📰 ${titulo.slice(0, 70)}`);

        const analise = calcularRelevancia(titulo, resumo, fonte.nome);
        const textoCompleto = normalizar(`${titulo} ${resumo}`);
        const categoria = determinarCategoria(analise, textoCompleto);

        console.log(`   📊 Score: ${analise.score}/100 | ${analise.nivel}`);
        console.log(`   🎯 Âncoras: ${analise.ancoras.join(', ') || '—'}`);
        console.log(`   🌐 Contextos: ${analise.contextos.join(', ') || '—'}`);
        console.log(`   🧭 Operacional: ${analise.operacionalReal ? 'sim' : 'não'}`);
        console.log(`   🏷️ Categoria: ${categoria}`);

        const decisao = decidirPublicacao(textoCompleto, analise, categoria, fonte.nome);
        console.log(`   🚦 ${decisao.status} — ${decisao.motivo}`);

        if (decisao.status === 'nao_publicar') {
          console.log('   ❌ DESCARTADA');
          continue;
        }

        const existing = await db.collection('noticias').where('link', '==', link).get();
        if (!existing.empty) {
          console.log('   ⏭️ Duplicada');
          continue;
        }

        let localizacao = null;
        if (analise.localidade) {
          localizacao = await geocodificar(analise.localidade);
        }

        // Detecta palavras-chave encontradas (pro compat do site)
        const palavrasEncontradas = [];
        for (const [tema, config] of Object.entries(EVENTOS_OPERACIONAIS)) {
          for (const p of config.palavras) {
            if (textoCompleto.includes(normalizar(p))) {
              palavrasEncontradas.push(p);
            }
          }
        }

        const noticia = {
          titulo,
          resumo,
          link,
          fonte: fonte.nome,
          categoria,

          // ---- CAMPOS DE DECISÃO ----
          statusPublicacao: decisao.status,
          motivoPublicacao: decisao.motivo,
          limiarUsado: decisao.limiarUsado,
          severidadeCritica: decisao.severidadeCritica,
          riscoAlto: decisao.riscoAlto || false,

          // ---- SCORE E ANÁLISE ----
          score: analise.score,
          nivel: analise.nivel,
          ancoras: analise.ancoras,
          contextos: analise.contextos,
          operacionalReal: analise.operacionalReal,
          motivos: analise.motivos,
          localidade: analise.localidade || null,
          rodovia: analise.rodovia || null,
          localizacao,

          // ---- COMPATIBILIDADE COM O SITE ----
          lidaPor: [],
          reacoes: { '👍': 0, '⚠️': 0, '🔥': 0 },
          palavrasChaveEncontradas: palavrasEncontradas.length > 0 ? palavrasEncontradas : ['geral'],

          // ---- DATAS ----
          dataPublicacao: dataPub,
          dataColeta: new Date(),
          dataExpiracao: calcularDataExpiracao(categoria, decisao.severidadeCritica)
        };

        await db.collection('noticias').add(noticia);
        total++;
        console.log('   ✅ SALVA');

        const deveAlertar =
          noticia.score >= SCORE_ALERTA ||
          decisao.severidadeCritica === true ||
          decisao.riscoAlto === true;

        if (deveAlertar && decisao.status !== 'painel_interno') {
          noticiasCriticas.push(noticia);
        }
      }
    } catch (error) {
      console.error(`❌ Erro em ${fonte.nome}:`, error.message);
    }
  }

  console.log(`\n✅ Total salvo: ${total} notícia(s)`);
  await enviarResumo(noticiasCriticas);
}

// ============================================================
// EXECUÇÃO
// ============================================================

coletarNoticias()
  .then(() => {
    console.log('🏁 Coleta finalizada.');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Erro na coleta:', err);
    process.exit(1);
  });

module.exports = { coletarNoticias, calcularRelevancia, decidirPublicacao };
