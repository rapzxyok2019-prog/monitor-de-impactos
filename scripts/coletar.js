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
const SCORE_ALERTA = 70;   // Mínimo para alerta por e-mail (quando não for severidade crítica)
const MAX_NOTICIAS_POR_FONTE = 8;

// ------------------------------------------------------------
// LIMIARES POR CATEGORIA
// Cada categoria tem seu próprio mínimo para subir no site
// ------------------------------------------------------------
const LIMIARES_POR_CATEGORIA = {
  policial:       35,
  greve:          40,
  clima:          30,   // chuva forte / temporal precisa subir
  acidente:       30,
  transito:       30,
  infraestrutura: 35,
  logistica:      45,
  geral:          45,
  padrao:         40
};

// Se for evento crítico, pode publicar com score menor
const LIMIAR_EXCECAO_CRITICA = 20;

// Fonte oficial pode publicar como "atenção" com score menor
const FONTES_OFICIAIS = ['inmet', 'cemaden', 'defesa civil', 'defesa_civil', 'crh'];
const LIMIAR_FONTE_OFICIAL = 15;

// Abaixo disso não sobe nem no painel interno
const LIMIAR_PAINEL_INTERNO = 10;

// Termos que caracterizam severidade crítica
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
  'futebol', 'campeonato', 'jogador', 'time', 'olimpíada', 'olimpiada',
  'celebridade', 'famoso', 'novela', 'cinema', 'filme', 'série', 'serie', 'música', 'musica',
  'cantor', 'ator', 'influenciador', 'bbb', 'reality show', 'horóscopo', 'horoscopo',
  'moda', 'fofoca', 'receita', 'entretenimento',
  'safra', 'soja', 'milho', 'trigo', 'café', 'cafe', 'plantio', 'colheita', 'agronegócio',
  'vacina', 'hospital', 'câncer', 'cancer', 'pandemia', 'covid',
  'viralizou', 'viraliza', 'internautas', 'curiosidade'
];

// ============================================================
// TERMOS DE BAIXA UTILIDADE OPERACIONAL
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
      // Roubo/furto de carga (operação direta)
      'roubo de carga', 'carga roubada', 'furto de carga', 'assalto a caminhão', 'assalto a caminhao',
      'assalto a carreta', 'roubo de caminhão', 'roubo de caminhao', 'roubo de carreta',
      'desvio de carga', 'carga desviada', 'apreensão de carga', 'apreensao de carga',

      // Crime organizado (risco operacional no RJ e capitais)
      'facção', 'faccao', 'milícia', 'milicia', 'pcc', 'comando vermelho',
      'tráfico', 'trafico', 'tráfico de drogas', 'trafico de drogas',
      'crime organizado', 'guerra do tráfico', 'guerra do trafico',
      'domínio de comunidade', 'dominio de comunidade',
      'toque de recolher', 'estado de emergência', 'estado de emergencia',

      // Operações que bloqueiam vias
      'operação policial', 'operacao policial', 'operação da prf', 'operacao da prf',
      'blitz', 'barreira policial', 'perseguição', 'perseguicao',
      'confronto', 'tiroteio', 'operação em comunidade', 'operacao em comunidade',

      // Risco imediato em via
      'arrastão', 'arrastao', 'saque', 'saques', 'depredação', 'depredacao',
      'ônibus queimado', 'onibus queimado', 'veículo queimado', 'veiculo queimado',
      'barricada', 'tumulto',

      // Incidentes com impacto logístico
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
      // Chuvas e alagamentos (contexto real)
      'chuva forte', 'chuvas intensas', 'chuvas fortes', 'temporal', 'tempestade',
      'enchente', 'alagamento', 'alagamentos', 'inundação', 'inundacao',
      'deslizamento', 'desabamento por chuva', 'transbordamento',
      'cheia do rio', 'nível do rio', 'nivel do rio',

      // Eventos extremos
      'vendaval', 'ciclone', 'tornado', 'furacão', 'furacao', 'granizo',
      'frente fria', 'onda de calor', 'calor extremo', 'ressaca', 'ventania',

      // Alertas oficiais
      'alerta meteorológico', 'alerta meteorologico',
      'alerta de chuva', 'alerta de tempestade',
      'aviso de tempestade', 'aviso de tempestades',
      'aviso meteorológico', 'aviso meteorologico',

      // Impacto climático direto
      'queda de árvore', 'queda de arvore', 'queda de poste',
      'destelhamento', 'destruição por chuva', 'destruicao por chuva'
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
      'transporte', 'transportadora', 'caminhão', 'caminhao', 'caminhões', 'caminhoes',
      'carreta', 'carga', 'combustível', 'combustivel',
      'centro de distribuição', 'centro de distribuicao',
      'logística', 'logistica', 'cadeia de suprimentos', 'estoque',
      'entrega', 'entregas', 'expedição', 'expedicao'
    ],
    peso: 15
  }
};

// ============================================================
// TERMOS DE IMPACTO OPERACIONAL
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
  { nome: 'G1 - Minas Gerais', url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/', categoria: 'geral' },
  { nome: 'G1 - Paraná', url: 'https://g1.globo.com/rss/g1/pr/parana/', categoria: 'geral' },
  { nome: 'G1 - Rio de Janeiro', url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', categoria: 'geral' },
  { nome: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', categoria: 'geral' },
  { nome: 'R7 - São Paulo', url: 'https://noticias.r7.com/sao-paulo/feed.xml', categoria: 'geral' },
  { nome: 'R7 - Rio de Janeiro', url: 'https://noticias.r7.com/rio-de-janeiro/feed.xml', categoria: 'geral' },
  { nome: 'Estadão - Polícia', url: 'https://estadao.com.br/rss/policia.xml', categoria: 'seguranca' },
  { nome: 'O Globo - São Paulo', url: 'https://oglobo.globo.com/rss/sao-paulo/', categoria: 'geral' },
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
// DETECTAR EVENTOS
// ============================================================

function detectarEventos(texto) {
  const eventos = [];
  for (const [categoria, config] of Object.entries(EVENTOS_OPERACIONAIS)) {
    const encontrou = config.palavras.some(palavra => texto.includes(normalizar(palavra)));
    if (encontrou) eventos.push(categoria);
  }
  return eventos;
}

// ============================================================
// DETECTAR IMPACTO OPERACIONAL
// ============================================================

function detectarImpactoOperacional(texto) {
  const impactos = [];
  if (contem(texto, TERMOS_IMPACTO)) impactos.push('impacto operacional');
  if (contem(texto, TERMOS_IMPACTO_FORTE)) impactos.push('impacto operacional forte');
  return impactos;
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

  // ----------------------------------------------------------
  // BLOQUEIO
  // ----------------------------------------------------------
  for (const bloqueio of PALAVRAS_BLOQUEIO) {
    if (texto.includes(normalizar(bloqueio))) {
      score -= 60;
      motivos.push(`bloqueio: ${bloqueio}`);
      break;
    }
  }

  // ----------------------------------------------------------
  // EVENTOS
  // ----------------------------------------------------------
  const eventos = detectarEventos(texto);
  for (const evento of eventos) {
    const peso = EVENTOS_OPERACIONAIS[evento].peso;
    score += peso;
    motivos.push(evento);
  }

  // ----------------------------------------------------------
  // LOCALIDADE
  // ----------------------------------------------------------
  const localidade = detectarLocalidade(titulo, resumo);
  if (localidade) {
    score += 15;
    motivos.push(`localidade: ${localidade}`);
  }

  // ----------------------------------------------------------
  // RODOVIA
  // ----------------------------------------------------------
  const rodovia = detectarRodovia(titulo, resumo);
  if (rodovia) {
    score += 20;
    motivos.push(`rodovia: ${rodovia}`);
  }

  // ----------------------------------------------------------
  // IMPACTO OPERACIONAL
  // ----------------------------------------------------------
  const impactos = detectarImpactoOperacional(texto);
  const temImpactoOperacional = impactos.length > 0;
  if (temImpactoOperacional) {
    score += 25;
    impactos.forEach(i => motivos.push(i));
  }

  // ----------------------------------------------------------
  // BAIXA UTILIDADE
  // ----------------------------------------------------------
  const baixaUtilidade = detectarBaixaUtilidade(texto);
  if (baixaUtilidade.length > 0) {
    score -= 5 * baixaUtilidade.length;
    motivos.push(`conteúdo secundário: ${baixaUtilidade.join(', ')}`);
  }

  // ----------------------------------------------------------
  // FONTE ESPECIALIZADA
  // ----------------------------------------------------------
  const fonteNormalizada = normalizar(fonte);
  if (fonteNormalizada.includes('seguranca') || fonteNormalizada.includes('policia')) {
    score += 10;
    motivos.push('fonte especializada');
  }

  // ----------------------------------------------------------
  // REGRA ESPECIAL: crime organizado exige localidade monitorada
  // ----------------------------------------------------------
  const termosCrimeOrganizado = [
    'facção', 'faccao', 'milícia', 'milicia', 'pcc', 'comando vermelho',
    'tráfico', 'trafico', 'crime organizado', 'guerra do tráfico', 'guerra do trafico',
    'domínio de comunidade', 'dominio de comunidade', 'toque de recolher'
  ];
  const temCrimeOrganizado = termosCrimeOrganizado.some(t => texto.includes(normalizar(t)));

  if (temCrimeOrganizado && !localidade) {
    score -= 40;
    motivos.push('crime organizado sem localidade monitorada');
  }

  // ----------------------------------------------------------
  // LIMITAR SCORE
  // ----------------------------------------------------------
  score = Math.max(0, Math.min(100, score));

  // ----------------------------------------------------------
  // NÍVEL
  // ----------------------------------------------------------
  let nivel = 'DESCARTAR';
  if (score >= 85) nivel = 'CRÍTICO';
  else if (score >= 70) nivel = 'ALTO';
  else if (score >= 40) nivel = 'MONITORAR';

  return {
    score,
    nivel,
    eventos,
    localidade,
    rodovia,
    impactos,
    temImpactoOperacional,
    baixaUtilidade,
    motivos
  };
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
        console.log(`   🔎 ${analise.motivos.join(', ')}`);

        // NOVA LÓGICA DE PUBLICAÇÃO
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

          // ---- NOVOS CAMPOS DE DECISÃO ----
          statusPublicacao: decisao.status,
          motivoPublicacao: decisao.motivo,
          limiarUsado: decisao.limiarUsado,
          severidadeCritica: decisao.severidadeCritica,
          // ---------------------------------

          score: analise.score,
          nivel: analise.nivel,
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

        // E-mail: agora dispara por score alto OU severidade crítica
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
