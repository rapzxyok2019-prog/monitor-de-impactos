// ============================================================
// MONITOR DE IMPACTOS - COLETOR OPERACIONAL v2.2
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

// Score mínimo para salvar no site
const SCORE_MINIMO = 30;

// Score mínimo para alerta por e-mail
const SCORE_ALERTA = 70;

// Quantidade máxima de notícias por RSS
const MAX_NOTICIAS_POR_FONTE = 8;

// ============================================================
// RESEND
// ============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY não configurada.');
}

const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

// ============================================================
// E-MAIL
// ============================================================

const EMAIL_REMETENTE = 'Resend <onboarding@resend.dev>';

const EMAIL_DESTINATARIOS = [
  'rapzxyok2019@gmail.com'
];

// ============================================================
// PALAVRAS DE BLOQUEIO
// ============================================================

const PALAVRAS_BLOQUEIO = [

  'eleição',
  'eleições',
  'votação',
  'partido político',
  'partido politico',
  'deputado',
  'senador',
  'vereador',

  'celebridade',
  'famoso',
  'artista',
  'novela',
  'cinema',
  'filme',
  'série',
  'serie',
  'música',
  'musica',
  'cantor',
  'ator',
  'influenciador',
  'bbb',
  'reality show',
  'futebol',
  'campeonato',
  'jogador',
  'time',
  'olimpíada',
  'olimpiada',

  'horóscopo',
  'horoscopo',
  'moda',
  'fofoca',
  'receita',
  'entretenimento',

  'safra',
  'soja',
  'milho',
  'trigo',
  'café',
  'cafe',
  'plantio',
  'colheita'

];

// ============================================================
// CONTEÚDO DE BAIXA UTILIDADE OPERACIONAL
// ============================================================

const TERMOS_BAIXA_UTILIDADE = [

  'passageiros comemoram',
  'passageiros celebram',
  'passageiros se emocionam',
  'passageiros ficam aliviados',
  'passageiros relatam',
  'passageiros contam',

  'vídeo mostra',
  'video mostra',
  'vídeo revela',
  'video revela',
  'imagens mostram',
  'imagens revelam',

  'veja o vídeo',
  'veja o video',
  'veja imagens',

  'viralizou',
  'viraliza',
  'repercute nas redes',
  'nas redes sociais',
  'internautas',

  'momento emocionante',
  'momento de tensão',
  'momento de alivio',
  'momento de alívio',

  'curiosidade',
  'história',
  'historia',

  'relato de passageiro',
  'relato de passageiros'

];

// ============================================================
// EVENTOS OPERACIONAIS
// ============================================================

const EVENTOS_OPERACIONAIS = {

  acidente: {

    palavras: [
      'acidente',
      'colisão',
      'colisao',
      'capotamento',
      'engavetamento',
      'atropelamento',
      'batida',
      'tombamento',
      'tombou',
      'carreta tombou',
      'caminhão tombou',
      'caminhao tombou'
    ],

    peso: 25

  },

  transito: {

    palavras: [
      'interdição',
      'interdicao',
      'interditada',
      'interditado',
      'rodovia',
      'trânsito',
      'transito',
      'congestionamento',
      'lentidão',
      'lentidao',
      'desvio',
      'pista bloqueada',
      'pista interditada',
      'faixa bloqueada',
      'faixa interditada',
      'bloqueio'
    ],

    peso: 20

  },

  clima: {

    palavras: [
      'enchente',
      'alagamento',
      'alagamentos',
      'inundação',
      'inundacao',
      'deslizamento',
      'tempestade',
      'chuva intensa',
      'chuvas fortes',
      'chuva forte',
      'granizo',
      'vendaval',
      'ciclone',
      'tornado',
      'temporal'
    ],

    peso: 25

  },

  seguranca: {

    palavras: [
      'roubo de carga',
      'carga roubada',
      'assalto',
      'roubo',
      'furto de carga',
      'tiroteio',
      'confronto',
      'operação policial',
      'operacao policial',
      'bloqueio policial',
      'perseguição',
      'perseguicao',
      'crime organizado'
    ],

    peso: 20

  },

  greve: {

    palavras: [
      'greve',
      'paralisação',
      'paralisacao',
      'caminhoneiros',
      'manifestação',
      'manifestacao',
      'protesto',
      'piquete',
      'bloqueio de rodovia'
    ],

    peso: 25

  },

  infraestrutura: {

    palavras: [
      'falta de energia',
      'queda de energia',
      'apagão',
      'apagao',
      'incêndio',
      'incendio',
      'explosão',
      'explosao',
      'vazamento',
      'queda de ponte',
      'ponte interditada'
    ],

    peso: 20

  },

  logistica: {

    palavras: [
      'transporte',
      'transportadora',
      'caminhão',
      'caminhao',
      'caminhões',
      'caminhoes',
      'carreta',
      'carga',
      'combustível',
      'combustivel',
      'abastecimento',
      'centro de distribuição',
      'centro de distribuicao'
    ],

    peso: 10

  }

};

// ============================================================
// TERMOS DE IMPACTO OPERACIONAL
// ============================================================

const TERMOS_IMPACTO = [

  'interdição',
  'interdicao',
  'interditado',
  'interditada',

  'bloqueio',
  'bloqueada',
  'bloqueado',

  'evacuação',
  'evacuacao',

  'desvio',

  'congestionamento',

  'lentidão',
  'lentidao',

  'pista fechada',
  'pista interditada',

  'trânsito parado',
  'transito parado',

  'trânsito intenso',
  'transito intenso',

  'sem acesso',
  'acesso bloqueado',

  'rota alternativa',

  'paralisação',
  'paralisacao',

  'operação suspensa',
  'operacao suspensa',

  'operações suspensas',
  'operacoes suspensas',

  'atividade suspensa',
  'atividades suspensas',

  'serviço interrompido',
  'servico interrompido',

  'serviços interrompidos',
  'servicos interrompidos',

  'acesso restrito',
  'acesso interditado',

  'circulação interrompida',
  'circulacao interrompida',

  'circulação proibida',
  'circulacao proibida'

];

// ============================================================
// TERMOS DE IMPACTO AEROPORTUÁRIO
// ============================================================

const TERMOS_AEROPORTO_IMPACTO = [

  'aeroporto fechado',
  'aeroporto interditado',
  'aeroporto interditada',

  'pista do aeroporto fechada',
  'pista do aeroporto interditada',

  'voos cancelados',
  'voos suspensos',
  'voos interrompidos',

  'operações aeroportuárias suspensas',
  'operacoes aeroportuarias suspensas',

  'operações suspensas no aeroporto',
  'operacoes suspensas no aeroporto',

  'aeroporto suspende operações',
  'aeroporto suspende operacoes',

  'aeroporto interrompe operações',
  'aeroporto interrompe operacoes',

  'aeroporto sem operação',
  'aeroporto sem operacao'

];

// ============================================================
// TERMOS DE IMPACTO LOGÍSTICO
// ============================================================

const TERMOS_LOGISTICA_IMPACTO = [

  'entrega interrompida',
  'entregas interrompidas',

  'distribuição interrompida',
  'distribuicao interrompida',

  'transporte interrompido',
  'transportes interrompidos',

  'rota bloqueada',
  'rotas bloqueadas',

  'acesso à fábrica',
  'acesso a fabrica',

  'acesso à unidade',
  'acesso a unidade',

  'fábrica parada',
  'fabrica parada',

  'fábrica fechada',
  'fabrica fechada',

  'produção parada',
  'producao parada',

  'produção interrompida',
  'producao interrompida'

];

// ============================================================
// LOCALIDADES MONITORADAS
// ============================================================

const LOCALIDADES_MONITORADAS = [

  // São Paulo
  'são paulo',
  'sao paulo',
  'campinas',
  'itu',
  'sorocaba',
  'jundiaí',
  'jundiai',
  'santos',
  'indaiatuba',
  'salto',
  'itupeva',
  'americana',
  'limeira',
  'piracicaba',
  'sumaré',
  'sumare',
  'hortolândia',
  'hortolandia',
  'guarulhos',
  'osasco',
  'barueri',
  'são bernardo do campo',
  'sao bernardo do campo',
  'santo andré',
  'santo andre',
  'diadema',
  'mauá',
  'maua',
  'são caetano',
  'sao caetano',
  'ribeirão preto',
  'ribeirao preto',
  'são josé dos campos',
  'sao jose dos campos',
  'bauru',
  'marília',
  'marilia',
  'presidente prudente',

  // Minas Gerais
  'belo horizonte',
  'contagem',
  'betim',
  'uberlândia',
  'uberlandia',
  'nova lima',
  'juiz de fora',
  'montes claros',
  'governador valadares',

  // Paraná
  'curitiba',
  'são josé dos pinhais',
  'sao jose dos pinhais',
  'londrina',
  'maringá',
  'maringa',
  'ponta grossa',
  'cascavel',
  'foz do iguaçu',
  'foz do iguacu',

  // Rio de Janeiro
  'rio de janeiro',
  'niterói',
  'niteroi',
  'duque de caxias',
  'nova iguaçu',
  'nova iguacu',

  // Sul
  'porto alegre',
  'canoas',
  'caxias do sul',
  'florianópolis',
  'florianopolis',
  'joinville',
  'blumenau',

  // Centro-Oeste
  'brasília',
  'brasilia',
  'goiânia',
  'goiania',
  'cuiabá',
  'cuiaba',
  'campo grande',

  // Nordeste
  'salvador',
  'feira de santana',
  'recife',
  'caruaru',
  'fortaleza',
  'juazeiro do norte',
  'natal',
  'joão pessoa',
  'joao pessoa',
  'maceió',
  'maceio',
  'aracaju',
  'teresina',
  'são luís',
  'sao luis',
  'campina grande',

  // Norte
  'manaus',
  'belém',
  'belem',
  'palmas',
  'porto velho',
  'rio branco',
  'macapá',
  'macapa',
  'boa vista'

];

// ============================================================
// RODOVIAS IMPORTANTES
// ============================================================

const RODOVIAS_MONITORADAS = [

  // São Paulo - Principais
  'castello branco',
  'castelo branco',
  'anhanguera',
  'bandeirantes',
  'raposo tavares',
  'régis bittencourt',
  'regis bittencourt',
  'imigrantes',
  'anchieta',
  'rodoanel',
  'dom pedro',
  'washington luís',
  'washington luis',
  'marechal rondon',
  'carvalho pinto',
  'ayrton senna',
  'jacú pêssego',
  'jacu pessego',
  'sp-021',
  'sp-160',
  'sp-270',
  'sp-280',
  'sp-330',
  'sp-348',
  'sp-150',
  'sp-099',
  'sp-055',
  'sp-065',
  'sp-107',
  'sp-127',
  'sp-225',
  'sp-304',
  'sp-310',
  'sp-333',
  'sp-340',
  'sp-342',
  'sp-344',
  'sp-352',
  'sp-360',
  'sp-373',
  'sp-413',
  'sp-425',

  // Rio de Janeiro
  'presidente dutra',
  'dutra',
  'br-101',
  'br-116',
  'br-040',
  'br-495',
  'rj-071',
  'linha vermelha',
  'linha amarela',
  'avenida brasil',
  'ponte rio-niterói',
  'ponte rio niteroi',

  // Minas Gerais
  'fernão dias',
  'fernao dias',
  'br-381',
  'br-262',
  'br-040',
  'br-050',
  'br-135',
  'br-356',
  'br-365',
  'br-459',
  'br-491',
  'mg-050',
  'mg-030',
  'mg-010',
  'mg-020',
  'mg-040',
  'mg-060',
  'mg-129',
  'mg-133',
  'mg-155',
  'mg-188',
  'mg-190',
  'mg-223',
  'mg-230',
  'mg-235',
  'mg-238',
  'mg-251',
  'mg-260',
  'mg-262',
  'mg-270',
  'mg-290',
  'mg-307',
  'mg-311',
  'mg-314',
  'mg-317',
  'mg-320',
  'mg-322',
  'mg-323',
  'mg-326',
  'mg-329',
  'mg-330',
  'mg-332',
  'mg-335',
  'mg-338',
  'mg-340',
  'mg-342',
  'mg-345',
  'mg-347',
  'mg-350',
  'mg-352',
  'mg-353',
  'mg-354',
  'mg-356',
  'mg-358',
  'mg-360',
  'mg-362',
  'mg-364',
  'mg-365',
  'mg-367',
  'mg-368',
  'mg-370',
  'mg-372',
  'mg-374',
  'mg-376',
  'mg-378',
  'mg-380',
  'mg-383',
  'mg-385',
  'mg-386',
  'mg-388',

  // Paraná
  'br-116',
  'br-376',
  'br-277',
  'br-373',
  'br-476',
  'br-153',
  'br-158',
  'br-163',
  'br-272',
  'br-369',
  'br-487',
  'pr-092',
  'pr-151',
  'pr-160',
  'pr-170',
  'pr-180',
  'pr-182',
  'pr-218',
  'pr-239',
  'pr-280',
  'pr-317',
  'pr-323',
  'pr-340',
  'pr-364',
  'pr-369',
  'pr-418',
  'pr-423',
  'pr-427',
  'pr-436',
  'pr-437',
  'pr-438',
  'pr-442',
  'pr-445',
  'pr-446',
  'pr-447',
  'pr-448',
  'pr-450',
  'pr-452',
  'pr-456',
  'pr-459',
  'pr-460',
  'pr-463',
  'pr-465',
  'pr-466',
  'pr-468',
  'pr-471',
  'pr-473',
  'pr-475',
  'pr-476',
  'pr-478',
  'pr-480',
  'pr-482',
  'pr-484',
  'pr-486',
  'pr-487',
  'pr-488',
  'pr-490',
  'pr-491',
  'pr-492',
  'pr-493',
  'pr-495',
  'pr-496',
  'pr-497',
  'pr-498',
  'pr-500',
  'pr-502',
  'pr-504',
  'pr-506',
  'pr-508',
  'pr-510',
  'pr-512',
  'pr-514',
  'pr-516',
  'pr-518',
  'pr-520',
  'pr-522',
  'pr-524',
  'pr-526',
  'pr-528',
  'pr-530',
  'pr-532',
  'pr-534',
  'pr-536',
  'pr-538',

  // Rio Grande do Sul
  'br-116',
  'br-290',
  'br-386',
  'br-392',
  'br-448',
  'br-470',
  'br-471',
  'br-472',
  'br-480',
  'br-481',
  'br-482',
  'br-483',
  'br-484',
  'br-485',
  'br-486',
  'br-487',
  'rs-118',
  'rs-122',
  'rs-124',
  'rs-128',
  'rs-130',
  'rs-132',
  'rs-135',
  'rs-142',
  'rs-143',
  'rs-153',
  'rs-155',
  'rs-158',
  'rs-162',
  'rs-165',
  'rs-168',
  'rs-176',
  'rs-183',
  'rs-210',
  'rs-223',
  'rs-230',
  'rs-235',
  'rs-239',
  'rs-240',
  'rs-242',
  'rs-244',
  'rs-252',
  'rs-265',
  'rs-287',
  'rs-305',
  'rs-323',
  'rs-324',
  'rs-330',
  'rs-332',
  'rs-336',
  'rs-342',
  'rs-344',
  'rs-350',
  'rs-354',
  'rs-357',
  'rs-359',
  'rs-361',
  'rs-362',
  'rs-365',
  'rs-373',
  'rs-377',
  'rs-379',
  'rs-380',
  'rs-386',
  'rs-387',
  'rs-389',
  'rs-401',
  'rs-403',
  'rs-406',
  'rs-407',
  'rs-410',
  'rs-412',
  'rs-415',
  'rs-416',
  'rs-417',
  'rs-418',
  'rs-419',
  'rs-420',
  'rs-421',
  'rs-422',
  'rs-423',
  'rs-424',
  'rs-425',
  'rs-426',
  'rs-427',
  'rs-428',
  'rs-429',
  'rs-430',
  'rs-431',
  'rs-432',
  'rs-433',
  'rs-434',
  'rs-435',
  'rs-436',
  'rs-437',
  'rs-438',
  'rs-439',
  'rs-440',

  // Santa Catarina
  'br-101',
  'br-116',
  'br-158',
  'br-163',
  'br-280',
  'br-282',
  'br-470',
  'br-480',
  'sc-108',
  'sc-114',
  'sc-120',
  'sc-135',
  'sc-150',
  'sc-155',
  'sc-157',
  'sc-160',
  'sc-161',
  'sc-163',
  'sc-283',
  'sc-350',
  'sc-355',
  'sc-390',
  'sc-401',
  'sc-402',
  'sc-403',
  'sc-404',
  'sc-405',
  'sc-406',
  'sc-407',
  'sc-408',
  'sc-409',
  'sc-410',
  'sc-411',
  'sc-412',
  'sc-413',
  'sc-414',
  'sc-415',
  'sc-416',
  'sc-417',
  'sc-418',
  'sc-419',
  'sc-420',
  'sc-421',
  'sc-422',
  'sc-423',
  'sc-424',
  'sc-425',
  'sc-426',

  // Bahia
  'br-101',
  'br-116',
  'br-242',
  'br-324',
  'br-407',
  'br-415',
  'br-418',
  'br-420',
  'br-430',
  'br-489',
  'br-498',
  'ba-093',
  'ba-099',
  'ba-148',
  'ba-152',
  'ba-156',
  'ba-160',
  'ba-164',
  'ba-172',
  'ba-174',
  'ba-176',
  'ba-178',
  'ba-180',
  'ba-184',
  'ba-188',
  'ba-190',
  'ba-192',
  'ba-196',
  'ba-200',
  'ba-204',
  'ba-210',
  'ba-214',
  'ba-218',
  'ba-220',
  'ba-222',
  'ba-224',
  'ba-226',
  'ba-228',
  'ba-230',
  'ba-233',
  'ba-234',
  'ba-235',
  'ba-236',
  'ba-237',
  'ba-238',
  'ba-240',
  'ba-241',
  'ba-242',
  'ba-243',
  'ba-244',
  'ba-245',
  'ba-246',
  'ba-247',
  'ba-248',
  'ba-250',
  'ba-251',
  'ba-252',
  'ba-253',
  'ba-254',
  'ba-255',
  'ba-256',
  'ba-257',
  'ba-258',
  'ba-259',
  'ba-260',
  'ba-262',

  // Pernambuco
  'br-101',
  'br-104',
  'br-110',
  'br-116',
  'br-122',
  'br-232',
  'br-316',
  'br-408',
  'br-424',
  'br-428',
  'br-432',
  'br-498',
  'pe-001',
  'pe-005',
  'pe-008',
  'pe-009',
  'pe-010',
  'pe-015',
  'pe-017',
  'pe-018',
  'pe-020',
  'pe-022',
  'pe-025',
  'pe-027',
  'pe-028',
  'pe-030',
  'pe-032',
  'pe-035',
  'pe-037',
  'pe-038',
  'pe-040',
  'pe-042',
  'pe-045',
  'pe-050',
  'pe-051',
  'pe-052',
  'pe-055',
  'pe-060',
  'pe-062',
  'pe-063',
  'pe-064',
  'pe-065',
  'pe-070',
  'pe-071',
  'pe-075',
  'pe-082',
  'pe-085',
  'pe-088',
  'pe-090',
  'pe-095',
  'pe-100',
  'pe-102',
  'pe-103',
  'pe-104',
  'pe-105',
  'pe-109',
  'pe-110',
  'pe-115',
  'pe-120',
  'pe-122',
  'pe-125',
  'pe-126',
  'pe-130',
  'pe-132',
  'pe-135',
  'pe-140',
  'pe-145',
  'pe-150',
  'pe-155',
  'pe-160',
  'pe-166',
  'pe-170',
  'pe-177',
  'pe-180',
  'pe-190',
  'pe-193',
  'pe-218',
  'pe-263',
  'pe-265',
  'pe-270',
  'pe-275',
  'pe-280',
  'pe-285',
  'pe-292',
  'pe-300',
  'pe-304',
  'pe-309',
  'pe-320',
  'pe-337',
  'pe-350',
  'pe-360',
  'pe-365',
  'pe-375',
  'pe-390',
  'pe-400',
  'pe-430',
  'pe-449',
  'pe-480',
  'pe-507',
  'pe-555',
  'pe-585',
  'pe-630',
  'pe-635',

  // Ceará
  'br-020',
  'br-116',
  'br-122',
  'br-222',
  'br-226',
  'br-230',
  'br-304',
  'br-402',
  'br-403',
  'br-404',
  'ce-010',
  'ce-020',
  'ce-025',
  'ce-040',
  'ce-050',
  'ce-060',
  'ce-065',
  'ce-080',
  'ce-085',
  'ce-090',
  'ce-095',
  'ce-123',
  'ce-124',
  'ce-125',
  'ce-127',
  'ce-137',
  'ce-140',
  'ce-142',
  'ce-143',
  'ce-148',
  'ce-151',
  'ce-152',
  'ce-153',
  'ce-156',
  'ce-163',
  'ce-166',
  'ce-168',
  'ce-170',
  'ce-176',
  'ce-178',
  'ce-179',
  'ce-183',
  'ce-184',
  'ce-186',
  'ce-187',
  'ce-188',
  'ce-189',
  'ce-190',
  'ce-191',
  'ce-192',
  'ce-193',
  'ce-194',
  'ce-195',
  'ce-196',
  'ce-197',
  'ce-199',
  'ce-200',
  'ce-201',
  'ce-202',
  'ce-203',
  'ce-204',
  'ce-205',
  'ce-206',
  'ce-207',
  'ce-208',
  'ce-209',
  'ce-210',
  'ce-211',
  'ce-212',
  'ce-213',
  'ce-214',
  'ce-215',
  'ce-216',
  'ce-217',
  'ce-218',
  'ce-219',
  'ce-220',
  'ce-221',
  'ce-222',
  'ce-223',
  'ce-224',
  'ce-225',
  'ce-226',
  'ce-227',
  'ce-228',
  'ce-229',
  'ce-230',
  'ce-231',
  'ce-232',
  'ce-233',
  'ce-234',

  // Goiás
  'br-020',
  'br-040',
  'br-050',
  'br-060',
  'br-070',
  'br-080',
  'br-153',
  'br-158',
  'br-251',
  'br-414',
  'br-452',
  'go-010',
  'go-020',
  'go-040',
  'go-050',
  'go-060',
  'go-070',
  'go-080',
  'go-108',
  'go-110',
  'go-112',
  'go-114',
  'go-116',
  'go-118',
  'go-132',
  'go-139',
  'go-142',
  'go-147',
  'go-150',
  'go-151',
  'go-154',
  'go-156',
  'go-164',
  'go-166',
  'go-173',
  'go-174',
  'go-178',
  'go-180',
  'go-184',
  'go-188',
  'go-194',
  'go-200',
  'go-202',
  'go-206',
  'go-210',
  'go-213',
  'go-216',
  'go-217',
  'go-218',
  'go-219',
  'go-220',
  'go-222',
  'go-223',
  'go-224',
  'go-225',
  'go-226',
  'go-227',
  'go-228',
  'go-229',
  'go-230',
  'go-231',
  'go-232',
  'go-233',
  'go-234',
  'go-235',
  'go-236',
  'go-237',
  'go-238',
  'go-239',

  // Mato Grosso / Mato Grosso do Sul
  'br-060',
  'br-070',
  'br-158',
  'br-163',
  'br-174',
  'br-242',
  'br-251',
  'br-262',
  'br-267',
  'br-364',
  'br-376',
  'br-419',
  'br-436',
  'br-454',
  'ms-040',
  'ms-060',
  'ms-080',
  'ms-112',
  'ms-134',
  'ms-141',
  'ms-145',
  'ms-147',
  'ms-156',
  'ms-162',
  'ms-164',
  'ms-166',
  'ms-168',
  'ms-171',
  'ms-174',
  'ms-178',
  'ms-180',
  'ms-182',
  'ms-184',
  'ms-185',
  'ms-190',
  'ms-192',
  'ms-196',
  'ms-200',
  'ms-203',
  'ms-210',
  'ms-211',
  'ms-213',
  'ms-215',
  'ms-216',
  'ms-223',
  'ms-227',
  'ms-228',
  'ms-230',
  'ms-233',
  'ms-235',
  'ms-238',
  'ms-240',
  'ms-244',
  'ms-245',
  'ms-247',
  'ms-248',
  'ms-250',
  'ms-251',
  'ms-252',
  'ms-253',
  'ms-254',
  'ms-255',
  'ms-256',
  'ms-257',
  'ms-258',
  'ms-259',
  'ms-260',
  'ms-261',
  'ms-262',
  'ms-263',
  'ms-264',
  'ms-265',

  // Amazonas / Pará / Norte
  'br-174',
  'br-210',
  'br-230',
  'br-307',
  'br-317',
  'br-319',
  'br-364',
  'br-422',
  'br-425',
  'br-429',
  'br-432',

  // Rodovias nacionais importantes
  'br-116',
  'br-101',
  'br-040',
  'br-050',
  'br-060',
  'br-070',
  'br-080',
  'br-153',
  'br-158',
  'br-163',
  'br-174',
  'br-210',
  'br-222',
  'br-226',
  'br-230',
  'br-232',
  'br-235',
  'br-242',
  'br-251',
  'br-259',
  'br-262',
  'br-265',
  'br-267',
  'br-277',
  'br-280',
  'br-282',
  'br-290',
  'br-304',
  'br-307',
  'br-316',
  'br-317',
  'br-319',
  'br-324',
  'br-356',
  'br-364',
  'br-365',
  'br-369',
  'br-373',
  'br-376',
  'br-381',
  'br-386',
  'br-392',
  'br-402',
  'br-403',
  'br-404',
  'br-407',
  'br-408',
  'br-414',
  'br-415',
  'br-418',
  'br-420',
  'br-422',
  'br-423',
  'br-424',
  'br-425',
  'br-428',
  'br-429',
  'br-430',
  'br-432',
  'br-436',
  'br-448',
  'br-452',
  'br-454',
  'br-459',
  'br-463',
  'br-465',
  'br-467',
  'br-469',
  'br-470',
  'br-471',
  'br-472',
  'br-476',
  'br-480',
  'br-481',
  'br-482',
  'br-483',
  'br-484',
  'br-485',
  'br-486',
  'br-487',
  'br-488',
  'br-489',
  'br-490',
  'br-491',
  'br-492',
  'br-493',
  'br-494',
  'br-495',
  'br-496',
  'br-497',
  'br-498',
  'br-499',
  'br-500'

];

// ============================================================
// FONTES
// ============================================================

const FONTES = [

  {
    nome: 'G1 - Segurança Pública',
    url: 'https://g1.globo.com/rss/g1/seguranca/',
    categoria: 'seguranca'
  },

  {
    nome: 'G1 - São Paulo',
    url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/',
    categoria: 'geral'
  },

  {
    nome: 'G1 - Minas Gerais',
    url: 'https://g1.globo.com/rss/g1/mg/minas-gerais/',
    categoria: 'geral'
  },

  {
    nome: 'G1 - Paraná',
    url: 'https://g1.globo.com/rss/g1/pr/parana/',
    categoria: 'geral'
  },

  {
    nome: 'G1 - Rio de Janeiro',
    url: 'https://g1.globo.com/rss/g1/rj/rio-de-janeiro/',
    categoria: 'geral'
  },

  {
    nome: 'CNN Brasil',
    url: 'https://www.cnnbrasil.com.br/feed/',
    categoria: 'geral'
  },

  {
    nome: 'R7 - São Paulo',
    url: 'https://noticias.r7.com/sao-paulo/feed.xml',
    categoria: 'geral'
  },

  {
    nome: 'R7 - Rio de Janeiro',
    url: 'https://noticias.r7.com/rio-de-janeiro/feed.xml',
    categoria: 'geral'
  },

  {
    nome: 'Estadão - Polícia',
    url: 'https://estadao.com.br/rss/policia.xml',
    categoria: 'seguranca'
  },

  {
    nome: 'O Globo - São Paulo',
    url: 'https://oglobo.globo.com/rss/sao-paulo/',
    categoria: 'geral'
  }

];

// ============================================================
// NORMALIZAÇÃO
// ============================================================

function normalizar(texto) {

  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

}

// ============================================================
// VERIFICAR PALAVRA
// ============================================================

function contem(texto, palavras) {

  return palavras.some(
    palavra =>
      texto.includes(
        normalizar(palavra)
      )
  );

}

// ============================================================
// CONTAR OCORRÊNCIAS
// ============================================================

function contarTermos(texto, palavras) {

  let total = 0;

  for (const palavra of palavras) {

    if (
      texto.includes(
        normalizar(palavra)
      )
    ) {

      total++;

    }

  }

  return total;

}

// ============================================================
// DETECTAR LOCAL
// ============================================================

function detectarLocalidade(titulo, resumo) {

  const texto =
    normalizar(
      `${titulo} ${resumo}`
    );

  for (const local of LOCALIDADES_MONITORADAS) {

    if (
      texto.includes(
        normalizar(local)
      )
    ) {

      return local;

    }

  }

  return null;

}

// ============================================================
// DETECTAR RODOVIA
// ============================================================

function detectarRodovia(titulo, resumo) {

  const texto =
    normalizar(
      `${titulo} ${resumo}`
    );

  for (const rodovia of RODOVIAS_MONITORADAS) {

    if (
      texto.includes(
        normalizar(rodovia)
      )
    ) {

      return rodovia;

    }

  }

  return null;

}

// ============================================================
// DETECTAR EVENTOS
// ============================================================

function detectarEventos(texto) {

  const eventos = [];

  for (
    const [categoria, config]
    of Object.entries(EVENTOS_OPERACIONAIS)
  ) {

    const encontrou =
      config.palavras.some(
        palavra =>
          texto.includes(
            normalizar(palavra)
          )
      );

    if (encontrou) {

      eventos.push(categoria);

    }

  }

  return eventos;

}

// ============================================================
// DETECTAR IMPACTO OPERACIONAL
// ============================================================

function detectarImpactoOperacional(texto) {

  const impactos = [];

  if (
    contem(
      texto,
      TERMOS_IMPACTO
    )
  ) {

    impactos.push(
      'impacto operacional'
    );

  }

  if (
    contem(
      texto,
      TERMOS_AEROPORTO_IMPACTO
    )
  ) {

    impactos.push(
      'impacto aeroportuário'
    );

  }

  if (
    contem(
      texto,
      TERMOS_LOGISTICA_IMPACTO
    )
  ) {

    impactos.push(
      'impacto logístico'
    );

  }

  return impactos;

}

// ============================================================
// DETECTAR CONTEÚDO DE BAIXA UTILIDADE
// ============================================================

function detectarBaixaUtilidade(texto) {

  const encontrados = [];

  for (
    const termo
    of TERMOS_BAIXA_UTILIDADE
  ) {

    if (
      texto.includes(
        normalizar(termo)
      )
    ) {

      encontrados.push(termo);

    }

  }

  return encontrados;

}

// ============================================================
// CALCULAR SCORE
// ============================================================

function calcularRelevancia(
  titulo,
  resumo,
  fonte
) {

  const texto =
    normalizar(
      `${titulo} ${resumo}`
    );

  let score = 0;

  const motivos = [];

  // ==========================================================
  // BLOQUEIOS
  // ==========================================================

  for (
    const bloqueio
    of PALAVRAS_BLOQUEIO
  ) {

    if (
      texto.includes(
        normalizar(bloqueio)
      )
    ) {

      score -= 60;

      motivos.push(
        `bloqueio: ${bloqueio}`
      );

      break;

    }

  }

  // ==========================================================
  // EVENTOS
  // ==========================================================

  const eventos =
    detectarEventos(texto);

  for (
    const evento
    of eventos
  ) {

    const peso =
      EVENTOS_OPERACIONAIS[
        evento
      ].peso;

    score += peso;

    motivos.push(
      evento
    );

  }

  // ==========================================================
  // LOCALIDADE
  // ==========================================================

  const localidade =
    detectarLocalidade(
      titulo,
      resumo
    );

  if (localidade) {

    score += 15;

    motivos.push(
      `localidade: ${localidade}`
    );

  }

  // ==========================================================
  // RODOVIA
  // ==========================================================

  const rodovia =
    detectarRodovia(
      titulo,
      resumo
    );

  if (rodovia) {

    score += 20;

    motivos.push(
      `rodovia: ${rodovia}`
    );

  }

  // ==========================================================
  // IMPACTO OPERACIONAL
  // ==========================================================

  const impactos =
    detectarImpactoOperacional(
      texto
    );

  const temImpactoOperacional =
    impactos.length > 0;

  if (
    temImpactoOperacional
  ) {

    score += 25;

    for (
      const impacto
      of impactos
    ) {

      motivos.push(
        impacto
      );

    }

  }

  // ==========================================================
  // BAIXA UTILIDADE
  // ==========================================================

  const baixaUtilidade =
    detectarBaixaUtilidade(
      texto
    );

  if (
    baixaUtilidade.length > 0
  ) {

    score -=
      15 *
      baixaUtilidade.length;

    motivos.push(
      `conteúdo secundário: ${baixaUtilidade.join(', ')}`
    );

  }

  // ==========================================================
  // REGRA ESPECIAL PARA AERONAVES
  // ==========================================================

  const mencionaAeronave =
    contem(
      texto,
      [
        'avião',
        'aviao',
        'aeronave',
        'aeroporto',
        'voo',
        'voos'
      ]
    );

  const temImpactoAereo =
    contem(
      texto,
      TERMOS_AEROPORTO_IMPACTO
    );

  if (
    mencionaAeronave &&
    !temImpactoAereo &&
    !rodovia &&
    !contem(
      texto,
      [
        'carga',
        'transporte de carga',
        'terminal de cargas',
        'logística',
        'logistica'
      ]
    )
  ) {

    score -= 20;

    motivos.push(
      'ocorrência aérea sem impacto operacional identificado'
    );

  }

  // ==========================================================
  // REGRA ESPECIAL PARA VÍDEOS / PASSAGEIROS
  // ==========================================================

  if (
    baixaUtilidade.length > 0 &&
    !temImpactoOperacional &&
    !rodovia
  ) {

    score -= 20;

    motivos.push(
      'conteúdo sem impacto operacional confirmado'
    );

  }

  // ==========================================================
  // FONTE ESPECIALIZADA
  // ==========================================================

  const fonteNormalizada =
    normalizar(fonte);

  if (
    fonteNormalizada.includes('seguranca') ||
    fonteNormalizada.includes('policia')
  ) {

    score += 10;

    motivos.push(
      'fonte especializada'
    );

  }

  // ==========================================================
  // BONIFICAÇÃO PARA IMPACTO FORTE
  // ==========================================================

  const impactoForte =
    contem(
      texto,
      [
        'interdição total',
        'interdicao total',
        'bloqueio total',
        'pista totalmente bloqueada',
        'operações suspensas',
        'operacoes suspensas',
        'fábrica parada',
        'fabrica parada',
        'produção parada',
        'producao parada',
        'evacuação',
        'evacuacao'
      ]
    );

  if (
    impactoForte
  ) {

    score += 15;

    motivos.push(
      'impacto operacional forte'
    );

  }

  // ==========================================================
  // LIMITAR SCORE
  // ==========================================================

  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );

  // ==========================================================
  // NÍVEL
  // ==========================================================

  let nivel =
    'DESCARTAR';

  if (
    score >= 85
  ) {

    nivel =
      'CRÍTICO';

  } else if (
    score >= 70
  ) {

    nivel =
      'ALTO';

  } else if (
    score >= 40
  ) {

    nivel =
      'MONITORAR';

  }

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
// VALIDAR ALERTA
// ============================================================

function podeEnviarAlerta(analise) {

  if (
    analise.score <
    SCORE_ALERTA
  ) {

    return false;

  }

  if (
    analise.temImpactoOperacional
  ) {

    return true;

  }

  if (
    analise.rodovia &&
    analise.eventos.length > 0
  ) {

    return true;

  }

  if (
    analise.eventos.includes('acidente') &&
    analise.localidade &&
    (
      analise.eventos.includes('transito') ||
      analise.eventos.includes('infraestrutura') ||
      analise.eventos.includes('greve')
    )
  ) {

    return true;

  }

  return false;

}

// ============================================================
// CATEGORIA
// ============================================================

function determinarCategoria(analise) {

  if (
    analise.rodovia
  ) {

    return 'transito';

  }

  if (
    analise.eventos.includes('acidente')
  ) {

    return 'acidente';

  }

  if (
    analise.eventos.includes('clima')
  ) {

    return 'clima';

  }

  if (
    analise.eventos.includes('greve')
  ) {

    return 'greve';

  }

  if (
    analise.eventos.includes('seguranca')
  ) {

    return 'policial';

  }

  if (
    analise.eventos.includes('infraestrutura')
  ) {

    return 'infraestrutura';

  }

  if (
    analise.eventos.includes('logistica')
  ) {

    return 'logistica';

  }

  if (
    analise.eventos.includes('transito')
  ) {

    return 'transito';

  }

  return 'geral';

}

// ============================================================
// GEOCODIFICAÇÃO
// ============================================================

async function geocodificar(cidade) {

  try {

    const response =
      await axios.get(
        'https://nominatim.openstreetmap.org/search',
        {

          params: {

            q:
              `${cidade}, Brasil`,

            format:
              'json',

            limit:
              1

          },

          headers: {

            'User-Agent':
              'Monitor-Impactos-Operacionais/2.2'

          },

          timeout: 10000

        }
      );

    if (
      response.data &&
      response.data.length > 0
    ) {

      return {

        lat:
          parseFloat(
            response.data[0].lat
          ),

        lng:
          parseFloat(
            response.data[0].lon
          ),

        cidade:
          response.data[0].display_name

      };

    }

  } catch (error) {

    console.log(
      `⚠️ Erro ao geocodificar "${cidade}":`,
      error.message
    );

  }

  return null;

}

// ============================================================
// EXPIRAÇÃO
// ============================================================

function calcularDataExpiracao() {

  const agora =
    new Date();

  const expira =
    new Date(
      agora
    );

  expira.setDate(
    expira.getDate() +
    DIAS_PADRAO
  );

  return expira;

}

// ============================================================
// ENVIAR RESUMO POR E-MAIL
// ============================================================

async function enviarResumo(noticiasCriticas) {

  if (
    noticiasCriticas.length === 0
  ) {

    console.log(
      '📧 Nenhuma notícia de alto impacto.'
    );

    return;

  }

  if (!resend) {

    console.error(
      '❌ E-mail não enviado: RESEND_API_KEY não configurada.'
    );

    return;

  }

  const dataHora =
    new Date().toLocaleString(
      'pt-BR',
      {
        timeZone:
          'America/Sao_Paulo'
      }
    );

  const total =
    noticiasCriticas.length;

  const contagemCategorias = {};

  for (
    const noticia
    of noticiasCriticas
  ) {

    const categoria =
      noticia.categoria ||
      'geral';

    contagemCategorias[categoria] =
      (
        contagemCategorias[categoria] ||
        0
      ) + 1;

  }

  const emojis = {

    acidente: '⚠️',
    transito: '🚧',
    clima: '🌧️',
    policial: '🚔',
    greve: '🚛',
    infraestrutura: '🏗️',
    logistica: '📦',
    fabrica: '🏭',
    geral: '📌'

  };

  let listaCategorias = '';

  for (
    const [categoria, quantidade]
    of Object.entries(
      contagemCategorias
    )
  ) {

    const emoji =
      emojis[categoria] ||
      '📌';

    listaCategorias +=
      `<li><strong>${emoji} ${categoria}</strong>: ${quantidade}</li>`;

  }

  const linkSite =
    'https://rapzxyok2019-prog.github.io/monitor-de-impactos/';

  const assunto =
    `🚨 ${total} alerta(s) operacional(is) - Monitor PepsiCo`;

  const mensagemHtml = `

    <h2 style="color:#003da5;">
      🚛 Monitor de Impactos - PepsiCo
    </h2>

    <p>
      <strong>Data/Hora:</strong> ${dataHora}
    </p>

    <p style="font-size:1.3rem;">
      <strong>📊 Total de alertas:</strong> ${total}
    </p>

    <div style="
      background:#eef2f6;
      padding:12px;
      border-radius:8px;
      margin:12px 0;
    ">

      <h4 style="margin:0;">
        📋 Resumo por categoria
      </h4>

      <ul style="
        margin:8px 0 0 0;
        padding-left:20px;
      ">

        ${listaCategorias}

      </ul>

    </div>

    <p style="margin:16px 0;">

      <a
        href="${linkSite}"
        target="_blank"
        style="
          background:#003da5;
          color:white;
          padding:10px 20px;
          border-radius:8px;
          text-decoration:none;
          font-weight:bold;
        "
      >
        🔍 Ver no Monitor
      </a>

    </p>

    <hr style="
      margin:24px 0;
      border:none;
      border-top:1px solid #e2e6ee;
    ">

    <p style="
      color:#6b7a93;
      font-size:0.8rem;
    ">
      Enviado automaticamente pelo Monitor de Impactos.
    </p>

  `;

  try {

    for (
      const destinatario
      of EMAIL_DESTINATARIOS
    ) {

      const resultado =
        await resend.emails.send({

          from:
            EMAIL_REMETENTE,

          to:
            [destinatario],

          subject:
            assunto,

          html:
            mensagemHtml

        });

      if (
        resultado.error
      ) {

        console.error(
          `❌ Erro ao enviar para ${destinatario}:`,
          resultado.error.message
        );

      } else {

        console.log(
          `📧 Alerta enviado para ${destinatario} (${total} notícias)`
        );

      }

    }

  } catch (error) {

    console.error(
      '❌ Erro no envio:',
      error.message
    );

  }

}

// ============================================================
// COLETA
// ============================================================

async function coletarNoticias() {

  console.log(
    '📡 Iniciando Monitor de Impactos v2.2...'
  );

  // ==========================================================
  // FIREBASE
  // ==========================================================

  if (
    getApps().length === 0
  ) {

    initializeApp();

  }

  const db =
    getFirestore();

  const parser =
    new Parser();

  let total =
    0;

  const noticiasCriticas =
    [];

  // ==========================================================
  // FONTES
  // ==========================================================

  for (
    const fonte
    of FONTES
  ) {

    try {

      console.log(
        `\n📡 ${fonte.nome}`
      );

      const feed =
        await parser.parseURL(
          fonte.url
        );

      const noticias =
        [];

      // ========================================================
      // NOTÍCIAS
      // ========================================================

      for (
        const item
        of feed.items.slice(
          0,
          MAX_NOTICIAS_POR_FONTE
        )
      ) {

        const titulo =
          item.title ||
          'Sem título';

        const resumo =
          item.contentSnippet ||
          item.content ||
          item.description ||
          '';

        const link =
          item.link ||
          '#';

        const dataPub =
          item.pubDate
            ? new Date(item.pubDate)
            : new Date();

        console.log(
          `📰 ${titulo.slice(0, 70)}`
        );

        // ======================================================
        // SCORE
        // ======================================================

        const analise =
          calcularRelevancia(
            titulo,
            resumo,
            fonte.nome
          );

        console.log(
          `   📊 Score: ${analise.score}/100`
        );

        console.log(
          `   🎯 Nível: ${analise.nivel}`
        );

        console.log(
          `   🧠 Impacto operacional: ${
            analise.temImpactoOperacional
              ? 'SIM'
              : 'NÃO'
          }`
        );

        console.log(
          `   🔎 ${analise.motivos.join(', ')}`
        );

        // ======================================================
        // DESCARTAR
        // ======================================================

        if (
          analise.score <
          SCORE_MINIMO
        ) {

          console.log(
            '   ❌ DESCARTADA'
          );

          continue;

        }

        // ======================================================
        // DUPLICIDADE
        // ======================================================

        const existing =
          await db
            .collection('noticias')
            .where(
              'link',
              '==',
              link
            )
            .get();

        if (
          !existing.empty
        ) {

          console.log(
            '   ⏭️ Duplicada'
          );

          continue;

        }

        // ======================================================
        // LOCALIZAÇÃO
        // ======================================================

        let localizacao =
          null;

        if (
          analise.localidade
        ) {

          localizacao =
            await geocodificar(
              analise.localidade
            );

        }

        // ======================================================
        // CATEGORIA
        // ======================================================

        const categoria =
          determinarCategoria(
            analise
          );

        // ======================================================
        // PALAVRAS ENCONTRADAS
        // ======================================================

        const palavrasEncontradas =
          analise.eventos;

        // ======================================================
        // OBJETO FINAL
        // ======================================================

        const noticia = {

          titulo,

          resumo,

          link,

          fonte:
            fonte.nome,

          categoria,

          dataPublicacao:
            dataPub,

          dataColeta:
            new Date(),

          dataExpiracao:
            calcularDataExpiracao(),

          scoreRelevancia:
            analise.score,

          nivelRelevancia:
            analise.nivel,

          eventosDetectados:
            analise.eventos,

          motivosRelevancia:
            analise.motivos,

          localidadeDetectada:
            analise.localidade,

          rodoviaDetectada:
            analise.rodovia,

          palavrasChaveEncontradas:
            palavrasEncontradas,

          temImpactoOperacional:
            analise.temImpactoOperacional,

          impactosDetectados:
            analise.impactos,

          baixaUtilidadeDetectada:
            analise.baixaUtilidade,

          lidaPor:
            [],

          reacoes: {

            '👍': 0,
            '⚠️': 0,
            '🔥': 0

          },

          localizacao

        };

        noticias.push(
          noticia
        );

        // ======================================================
        // ALERTA
        // ======================================================

        if (
          podeEnviarAlerta(
            analise
          )
        ) {

          noticiasCriticas.push(
            noticia
          );

          console.log(
            '   🚨 ALERTA DE E-MAIL'
          );

        } else {

          console.log(
            '   ℹ️ Sem alerta de e-mail'
          );

        }

        console.log(
          `   ✅ SALVA — ${categoria}`
        );

      }

      // ========================================================
      // FIREBASE
      // ========================================================

      if (
        noticias.length > 0
      ) {

        const batch =
          db.batch();

        for (
          const noticia
          of noticias
        ) {

          const ref =
            db
              .collection('noticias')
              .doc();

          batch.set(
            ref,
            noticia
          );

        }

        await batch.commit();

        console.log(
          `   💾 ${noticias.length} notícia(s) salva(s)`
        );

        total +=
          noticias.length;

      }

    } catch (error) {

      console.error(
        `❌ Erro em ${fonte.nome}:`,
        error.message
      );

    }

  }

  // ==========================================================
  // FINAL
  // ==========================================================

  console.log(
    '\n✅ Coleta finalizada!'
  );

  console.log(
    `📰 ${total} novas notícias`
  );

  console.log(
    `🚨 ${noticiasCriticas.length} alerta(s)`
  );

  await enviarResumo(
    noticiasCriticas
  );

  return total;

}

// ============================================================
// EXECUTAR
// ============================================================

coletarNoticias()

  .then(() => {

    console.log(
      '🏁 Processo encerrado com sucesso.'
    );

    process.exit(0);

  })

  .catch(error => {

    console.error(
      '❌ Erro geral:',
      error
    );

    process.exit(1);

  });
