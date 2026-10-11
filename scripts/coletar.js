// ============================================================
// MONITOR DE IMPACTOS - COLETOR OPERACIONAL v3.0
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
  policial:       35,
  greve:          40,
  clima:          30,
  acidente:       30,
  transito:       30,
  infraestrutura: 35,
  logistica:      45,
  geral:          45,
  padrao:         40
};

const LIMIAR_EXCECAO_CRITICA = 20;
const FONTES_OFICIAIS = ['inmet', 'cemaden', 'defesa civil', 'defesa_civil', 'crh'];
const LIMIAR_FONTE_OFICIAL = 15;
const LIMIAR_PAINEL_INTERNO = 20;

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
  'viralizou', 'viraliza', 'internautas', 'curiosidade'
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
// EVENTOS OPERACIONAIS
// ============================================================

const EVENTOS_OPERACIONAIS = {
  seguranca: {
    palavras: [
      'roubo de carga', 'carga roubada', 'furto de carga', 'assalto a caminhão', 'assalto a caminhao',
      'assalto a carreta', 'roubo de caminhão', 'roubo de caminhao', 'roubo de carreta',
      'desvio de carga', 'carga desviada', 'apreensão de carga', 'apreensao de carga',
      'facção', 'faccao', 'milícia', 'milicia', 'pcc', 'comando vermelho',
      'tráfico', 'trafico', 'tráfico de drogas', 'trafico de drogas',
      'crime organizado', 'guerra do tráfico', 'guerra do trafico',
      'domínio de comunidade', 'dominio de comunidade',
      'toque de recolher', 'estado de emergência', 'estado de emergencia',
      'operação policial', 'operacao policial', 'operação da prf', 'operacao da prf',
      'blitz', 'barreira policial', 'perseguição', 'perseguicao',
      'confronto', 'tiroteio', 'operação em comunidade', 'operacao em comunidade',
      'arrastão', 'arrastao', 'saque', 'saques', 'depredação', 'depredacao',
      'ônibus queimado', 'onibus queimado', 'veículo queimado', 'veiculo queimado',
      'barricada', 'tumulto',
      'incêndio em galpão', 'incendio em galpao', 'incêndio em depósito', 'incendio em deposito',
      'incêndio em caminhão', 'incendio em caminhao', 'incêndio em carreta', 'incendio em carreta'
    ],
    peso: 30
  },

  greve: {
    palavras: [
      'greve', 'paralisação', 'paralisacao', 'greve geral',
      'caminhoneiros', 'caminhoneiro', 'greve de caminhoneiros',
      'manifestação', 'manifestacao', 'protesto', 'piquete',
      'bloqueio de rodovia', 'travamento', 'paralisação de transporte', 'paralisacao de transporte'
    ],
    peso: 25
  },

  clima: {
    palavras: [
      'chuva forte', 'chuvas intensas', 'chuvas fortes', 'temporal', 'tempestade',
      'enchente', 'alagamento', 'alagamentos', 'inundação', 'inundacao',
      'deslizamento', 'desabamento por chuva', 'transbordamento',
      'cheia do rio', 'nível do rio', 'nivel do rio',
      'vendaval', 'ciclone', 'tornado', 'furacão', 'furacao', 'granizo',
      'frente fria', 'onda de calor', 'calor extremo', 'ressaca', 'ventania',
      'alerta meteorológico', 'alerta meteorologico',
      'alerta de chuva', 'alerta de tempestade',
      'aviso de tempestade', 'aviso de tempestades',
      'aviso meteorológico', 'aviso meteorologico',
      'queda de árvore', 'queda de arvore', 'queda de poste',
      'destelhamento', 'destruição por chuva', 'destruicao por chuva',
      'previsão do tempo', 'previsao do tempo', 'previsão para hoje', 'previsao para hoje'
    ],
    peso: 25
  },

  acidente: {
    palavras: [
      'acidente', 'colisão', 'colisao', 'capotamento', 'engavetamento',
      'atropelamento', 'batida', 'tombamento', 'tombou',
      'carreta tombou', 'caminhão tombou', 'caminhao tombou'
    ],
    peso: 25
  },

  transito: {
    palavras: [
      'interdição', 'interdicao', 'interditada', 'interditado',
      'bloqueio de pista', 'pista fechada', 'pista bloqueada',
      'faixa bloqueada', 'faixa interditada',
      'rodovia fechada', 'rodovia interditada', 'trânsito parado', 'transito parado',
      'congestionamento', 'lentidão', 'lentidao', 'desvio',
      'rota alternativa', 'obras na rodovia', 'acidente na rodovia',
      'bloqueio'
    ],
    peso: 20
  },

  infraestrutura: {
    palavras: [
      'falta de energia', 'apagão', 'apagao', 'queda de energia',
      'explosão', 'explosao', 'vazamento',
      'queda de ponte', 'ponte interditada', 'rompimento de barragem'
    ],
    peso: 20
  },

  fiscalizacao: {
    palavras: [
      'fiscalização', 'fiscalizacao', 'operação da prf', 'operacao da prf',
      'barreira fiscal', 'posto fiscal', 'balança', 'balanca',
      'controle de carga', 'controle de cargas', 'apreensão de veículo', 'apreensao de veiculo'
    ],
    peso: 20
  },

  abastecimento: {
    palavras: [
      'abastecimento', 'desabastecimento',
      'falta de combustível', 'falta de combustivel',
      'crise de combustível', 'crise de combustivel',
      'greve de combustível', 'greve de combustivel',
      'aumento do diesel', 'aumento da gasolina'
    ],
    peso: 25
  },

  logistica: {
    palavras: [
      'transportadora', 'caminhão', 'caminhao', 'caminhões', 'caminhoes',
      'carreta', 'combustível', 'combustivel',
      'centro de distribuição', 'centro de distribuicao',
      'logística', 'logistica', 'cadeia de suprimentos',
      'expedição', 'expedicao'
    ],
    peso: 15
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
  'trânsito parado', 'transito parado', 'trânsito intenso', 'transito intenso',
  'sem acesso', 'acesso bloqueado', 'rota alternativa',
  'paralisação', 'paralisacao',
  'operação suspensa', 'operacao suspensa', 'operações suspensas', 'operacoes suspensas',
  'atividade suspensa', 'atividades suspensas',
  'serviço interrompido', 'servico interrompido',
  'serviços interrompidos', 'servicos interrompidos',
  'acesso restrito', 'acesso interditado',
  'circulação interrompida', 'circulacao interrompida',
  'circulação proibida', 'circulacao proibida'
];

const TERMOS_IMPACTO_FORTE = [
  'interdição total', 'interdicao total', 'bloqueio total',
  'pista totalmente bloqueada', 'operações suspensas', 'operacoes suspensas',
  'fábrica parada', 'fabrica parada', 'produção parada', 'producao parada',
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
  { nome: 'G1 - Segurança Pública', url: 'https://g1.globo.com/rss/g1/seguranca/', categoria: 'seguranca' },
  { nome: 'G1 - São Paulo', url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/', categoria: 'geral' },
  { nome: 'G1 - Campinas', url: 'https://g1.globo.com/rss/g1/sp/campinas-regiao/', categoria: 'geral' },
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'geral' },
  { nome: 'G1 - Paraná', url: 'https://g1.globo.com/rss/g1/pr/parana/', categoria: 'geral' },
  { nome: 'G1 - Rio de Janeiro', url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', categoria: 'geral' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/geral/feed.xml', categoria: 'geral' },
  { nome: 'INMET - Alertas', url: 'https://alertas2.inmet.gov.br/', categoria: 'clima' },
  { nome: 'CEMADEN - Alertas', url: 'https://www.gov.br/cemaden/pt-br/assuntos/monitoramento/feed/', categoria: 'clima' },
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
// CALCULAR RELEVÂNCIA — COM LÓGICA DE CONTEXTO REAL
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
  // 2. ÂNCORAS — o "assunto real" da notícia
  // ==========================================================
  const ancoras = {
    clima: [
      'chuva forte', 'chuvas intensas', 'chuvas fortes',
      'temporal com chuva', 'tempestade com chuva', 'tempestade severa',
      'enchente', 'alagamento', 'alagamentos', 'inundação', 'inundacao',
      'deslizamento', 'desabamento por chuva', 'transbordamento',
      'cheia do rio', 'nível do rio', 'nivel do rio',
      'vendaval', 'ciclone', 'tornado', 'furacão', 'furacao', 'granizo',
      'frente fria', 'onda de calor', 'calor extremo', 'ressaca', 'ventania',
      'alerta meteorológico', 'alerta meteorologico',
      'alerta de chuva', 'alerta de tempestade',
      'aviso de tempestade', 'aviso de tempestades',
      'aviso meteorológico', 'aviso meteorologico',
      'previsão do tempo', 'previsao do tempo'
    ],
    greve: [
      'greve', 'paralisação', 'paralisacao', 'greve geral',
      'piquete', 'bloqueio de rodovia',
      'greve de caminhoneiros', 'greve dos caminhoneiros'
    ],
    acidente: [
      'acidente', 'colisão', 'colisao', 'capotamento', 'engavetamento',
      'atropelamento', 'tombamento', 'carreta tombou', 'caminhão tombou'
    ],
    seguranca: [
      'roubo de carga', 'carga roubada', 'furto de carga', 'assalto a caminhão', 'assalto a caminhao',
      'assalto a carreta', 'roubo de caminhão', 'roubo de caminhao', 'roubo de carreta',
      'facção', 'faccao', 'milícia', 'milicia', 'pcc', 'comando vermelho',
      'crime organizado', 'guerra do tráfico', 'guerra do trafico',
      'domínio de comunidade', 'dominio de comunidade',
      'toque de recolher',
      'operação policial', 'operacao policial', 'operação da prf', 'operacao da prf',
      'confronto', 'tiroteio', 'arrastão', 'arrastao',
      'ônibus queimado', 'onibus queimado', 'veículo queimado', 'veiculo queimado',
      'barricada', 'tumulto'
    ],
    transito: [
      'interdição', 'interdicao', 'interditada', 'bloqueio de pista',
      'pista fechada', 'pista bloqueada', 'rodovia fechada', 'rodovia interditada',
      'trânsito parado', 'transito parado', 'congestionamento',
      'rota alternativa', 'desvio'
    ],
    infraestrutura: [
      'falta de energia', 'apagão', 'apagao', 'queda de energia',
      'explosão', 'explosao', 'vazamento',
      'queda de ponte', 'ponte interditada', 'rompimento de barragem'
    ],
    abastecimento: [
      'falta de combustível', 'falta de combustivel',
      'crise de combustível', 'crise de combustivel',
      'desabastecimento', 'greve de combustível',
      'aumento do diesel', 'aumento da gasolina'
    ],
    fiscalizacao: [
      'fiscalização', 'fiscalizacao', 'barreira fiscal', 'posto fiscal',
      'balança', 'controle de carga', 'operação da prf'
    ],
    logistica: [
      'transportadora', 'centro de distribuição', 'centro de distribuicao',
      'cadeia de suprimentos', 'logística', 'logistica',
      'expedição', 'expedicao'
    ]
  };

  const ancorasEncontradas = [];
  for (const [tema, palavras] of Object.entries(ancoras)) {
    const bateu = palavras.some(p => texto.includes(normalizar(p)));
    if (bateu) {
      ancorasEncontradas.push(tema);
      score += 30;
      motivos.push(`âncora: ${tema}`);
    }
  }

  // ==========================================================
  // 3. CONTEXTOS — "onde / como" — confirma operação real
  // ==========================================================
  const contextos = {
    via: [
      'rodovia', 'avenida', 'rua', 'pista', 'estrada', 'br-', 'sp-', 'mg-',
      'pr-', 'rs-', 'sc-', 'ba-', 'pe-', 'ce-', 'go-', 'ms-',
      'castello branco', 'castelo branco', 'anhanguera', 'bandeirantes',
      'régis bittencourt', 'regis bittencourt', 'imigrantes', 'anchieta',
      'rodoanel', 'fernão dias', 'fernao dias'
    ],
    impacto: [
      'interdição', 'interdicao', 'interditada', 'interditado',
      'bloqueio', 'bloqueada', 'bloqueado', 'desvio', 'evacuação', 'evacuacao',
      'paralisação', 'paralisacao', 'operação suspensa', 'operacao suspensa',
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
  const temContexto = contextosEncontrados.length > 0;
  const temLocalidadeOuRodovia = !!localidade || !!rodovia;

  let operacionalReal = false;

  if (temAncora && (temContexto || temLocalidadeOuRodovia)) {
    operacionalReal = true;
  } else if (temAncora && !temContexto && !temLocalidadeOuRodovia) {
    score -= 20;
    motivos.push('âncora sem contexto nem localidade');
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
  // 7. CRIME ORGANIZADO — exige localidade monitorada
  // ==========================================================
  const termosCrime = ['facção', 'faccao', 'milícia', 'milicia', 'pcc',
                       'comando vermelho', 'guerra do tráfico', 'guerra do trafico',
                       'domínio de comunidade', 'dominio de comunidade',
                       'toque de recolher'];
  if (termosCrime.some(t => texto.includes(normalizar(t))) && !localidade) {
    score -= 40;
    motivos.push('crime organizado sem localidade monitorada');
  }

  // ==========================================================
  // 8. FONTE ESPECIALIZADA
  // ==========================================================
  const fonteNormalizada = normalizar(fonte);
  if (fonteNormalizada.includes('seguranca') || fonteNormalizada.includes('policia')) {
    score += 10;
    motivos.push('fonte especializada');
  }

  // ==========================================================
  // 9. LIMITAR + NÍVEL
  // ==========================================================
  score = Math.max(0, Math.min(100, score));

  let nivel = 'DESCARTAR';
  if (score >= 85) nivel = 'CRÍTICO';
  else if (score >= 70) nivel = 'ALTO';
  else if (score >= 40) nivel = 'MONITORAR';

  return {
    score,
    nivel,
    eventos: ancorasEncontradas,
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

function determinarCategoria(analise) {

  const pontos = {
    policial: 0, clima: 0, greve: 0, transito: 0,
    acidente: 0, infraestrutura: 0, logistica: 0,
    abastecimento: 0, fiscalizacao: 0
  };

  // ----------------------------------------------------------
  // 1. PESO POR ÂNCORA (o tema real)
  // ----------------------------------------------------------
  analise.eventos.forEach(ancora => {
    if (ancora === 'seguranca')       pontos.policial += 30;
    if (ancora === 'clima')           pontos.clima += 30;
    if (ancora === 'greve')           pontos.greve += 30;
    if (ancora === 'transito')        pontos.transito += 25;
    if (ancora === 'acidente')        pontos.acidente += 25;
    if (ancora === 'infraestrutura')  pontos.infraestrutura += 25;
    if (ancora === 'logistica')       pontos.logistica += 20;
    if (ancora === 'abastecimento')   pontos.abastecimento += 25;
    if (ancora === 'fiscalizacao')    pontos.fiscalizacao += 20;
  });

  // ----------------------------------------------------------
  // 2. BÔNUS POR CONTEXTO (o detalhe operacional)
  // ----------------------------------------------------------
  const contextos = analise.contextos || [];
  const temVia     = contextos.includes('via');
  const temImpacto = contextos.includes('impacto');
  const temSever   = contextos.includes('severidade');

  if (temVia) {
    pontos.transito += 20;
    pontos.acidente += 20;
    pontos.greve += 15;
  }
  if (temImpacto) {
    pontos.transito += 15;
    pontos.infraestrutura += 10;
  }
  if (temSever) {
    let maior = 0;
    for (const cat in pontos) if (pontos[cat] > maior) maior = pontos[cat];
    for (const cat in pontos) if (pontos[cat] === maior) pontos[cat] += 15;
  }

  // ----------------------------------------------------------
  // 3. REGRA DE CONTEXTO POR TEMA
  // ----------------------------------------------------------
  // Cada categoria só "confirma" se tiver contexto real
  // ----------------------------------------------------------

  // CLIMA só ganha se tiver contexto climático real
  const contextoClima = [
    'alagamento', 'alagamentos', 'alagou', 'enchente', 'inundação', 'inundacao',
    'transbordamento', 'deslizamento', 'destelhamento',
    'vendaval', 'ventania', 'granizo', 'ciclone', 'tornado',
    'chuva forte', 'chuva intensa', 'temporal com chuva',
    'alerta meteorológico', 'alerta meteorologico', 'alerta de chuva',
    'aviso de tempestade', 'defesa civil'
  ].some(p => analise.motivos.join(' ').toLowerCase().includes(normalizar(p)));

  if (!contextoClima && pontos.clima > 0) {
    // Previsão do tempo sem contexto real → perde os pontos de clima
    pontos.clima = Math.max(0, pontos.clima - 25);
  }

  // SEGURANÇA só ganha se tiver contexto real
  const contextoSeguranca = [
    'roubo de carga', 'carga roubada', 'furto de carga',
    'assalto a caminhão', 'assalto a carreta', 'roubo de caminhão', 'roubo de carreta',
    'facção', 'faccao', 'milícia', 'milicia', 'pcc', 'comando vermelho',
    'operação policial', 'operacao policial', 'confronto', 'tiroteio',
    'arrastão', 'arrastao', 'ônibus queimado', 'onibus queimado'
  ].some(p => analise.motivos.join(' ').toLowerCase().includes(normalizar(p)));

  if (!contextoSeguranca && pontos.policial > 0) {
    // Bateu em segurança mas sem contexto real → reduz peso
    pontos.policial = Math.max(0, pontos.policial - 20);
  }

  // ----------------------------------------------------------
  // 4. ESCOLHE VENCEDOR
  // ----------------------------------------------------------
  let melhor = 'geral';
  let maior = 0;
  for (const cat in pontos) {
    if (pontos[cat] > maior) { maior = pontos[cat]; melhor = cat; }
  }
  if (maior === 0) return 'geral';
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

  // ==========================================================
  // REGRA DE CONTEXTO: sem operacionalReal não sobe pro site
  // ==========================================================
  if (!analise.operacionalReal && !fonteOficial && !severidadeCritica) {
    if (analise.score >= LIMIAR_PAINEL_INTERNO) {
      return {
        status: 'painel_interno',
        motivo: 'Âncora sem contexto nem localidade — fica no painel interno.',
        limiarUsado: LIMIAR_PAINEL_INTERNO,
        severidadeCritica
      };
    }
    return {
      status: 'nao_publicar',
      motivo: 'Sem âncora ou contexto operacional.',
      limiarUsado: limiar,
      severidadeCritica
    };
  }

  // 1. Regra normal
  if (analise.score >= limiar) {
    return {
      status: 'publicar',
      motivo: `Score ${analise.score} >= limiar ${limiar} (${cat}).`,
      limiarUsado: limiar,
      severidadeCritica
    };
  }

  // 2. Exceção para evento crítico
  if (severidadeCritica && analise.score >= LIMIAR_EXCECAO_CRITICA) {
    return {
      status: 'publicar_atencao',
      motivo: `Evento crítico com score ${analise.score} abaixo do limiar ${limiar}, mas acima da exceção ${LIMIAR_EXCECAO_CRITICA}.`,
      limiarUsado: LIMIAR_EXCECAO_CRITICA,
      severidadeCritica
    };
  }

  // 3. Fonte oficial
  if (fonteOficial && analise.score >= LIMIAR_FONTE_OFICIAL) {
    return {
      status: 'publicar_atencao',
      motivo: `Fonte oficial "${fonte}" com score ${analise.score} >= ${LIMIAR_FONTE_OFICIAL}.`,
      limiarUsado: LIMIAR_FONTE_OFICIAL,
      severidadeCritica
    };
  }

  // 4. Painel interno
  if (analise.score >= LIMIAR_PAINEL_INTERNO) {
    return {
      status: 'painel_interno',
      motivo: `Score ${analise.score} abaixo do limiar público, mas acima do interno.`,
      limiarUsado: LIMIAR_PAINEL_INTERNO,
      severidadeCritica
    };
  }

  // 5. Não publicar
  return {
    status: 'nao_publicar',
    motivo: `Score ${analise.score} abaixo de todos os limiares.`,
    limiarUsado: limiar,
    severidadeCritica
  };
}

// ============================================================
// GEOCODIFICAÇÃO
// ============================================================

async function geocodificar(cidade) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: `${cidade}, Brasil`, format: 'json', limit: 1 },
      headers: { 'User-Agent': 'Monitor-Impactos-PepsiCo/3.0' },
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

function calcularDataExpiracao() {
  const agora = new Date();
  const expira = new Date(agora);
  expira.setDate(expira.getDate() + DIAS_PADRAO);
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
    policial: '🚔', clima: '🌧️', greve: '🚛',
    acidente: '⚠️', transito: '🚧', fabrica: '🏭',
    infraestrutura: '🏗️', logistica: '📦', geral: '📌'
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

  console.log('📡 Iniciando Monitor de Impactos v3.0...');

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

        console.log(`📰 ${titulo.slice(0, 70)}`);

        const analise = calcularRelevancia(titulo, resumo, fonte.nome);
        const textoCompleto = normalizar(`${titulo} ${resumo}`);
        const categoria = determinarCategoria(analise);

        console.log(`   📊 Score: ${analise.score}/100 | ${analise.nivel}`);
        console.log(`   🎯 Âncoras: ${analise.eventos.join(', ') || '—'}`);
        console.log(`   🌐 Contextos: ${analise.contextos.join(', ') || '—'}`);
        console.log(`   🧭 Operacional: ${analise.operacionalReal ? 'sim' : 'não'}`);
        console.log(`   🔎 ${analise.motivos.join(', ')}`);
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

        const noticia = {
          titulo,
          resumo,
          link,
          fonte: fonte.nome,
          categoria,

          statusPublicacao: decisao.status,
          motivoPublicacao: decisao.motivo,
          limiarUsado: decisao.limiarUsado,
          severidadeCritica: decisao.severidadeCritica,

          score: analise.score,
          nivel: analise.nivel,
          ancoras: analise.eventos,
          contextos: analise.contextos,
          operacionalReal: analise.operacionalReal,
          motivos: analise.motivos,
          localidade: analise.localidade || null,
          rodovia: analise.rodovia || null,
          localizacao,
          dataPublicacao: dataPub,
          dataColeta: new Date(),
          dataExpiracao: calcularDataExpiracao()
        };

        await db.collection('noticias').add(noticia);
        total++;
        console.log('   ✅ SALVA');

        const deveAlertar =
          noticia.score >= SCORE_ALERTA ||
          decisao.severidadeCritica === true;

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
