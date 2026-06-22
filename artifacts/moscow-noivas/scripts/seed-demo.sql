-- ============================================================================
-- Seed DEMO — Moscow Noivas (banco real heliumdb)
-- Popula a loja "loja-demo" com dados realistas para apresentação.
-- Idempotente: limpa os dados da loja-demo e dos usuários demo-* e recria.
-- Datas são relativas a NOW() para o calendário/financeiro ficarem sempre atuais.
--
-- Rodar:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/seed-demo.sql
-- ============================================================================

\set hash '$2b$12$VBgCyJDNQBUu6hxT7PMxceqXCdLP3y8domzDgwCUZ6/3enaBRpd6C'

BEGIN;

-- ── Limpeza idempotente (escopo: loja-demo + usuários demo-*) ───────────────
DELETE FROM "PagamentoItem"       WHERE "lojaId" = 'loja-demo';
DELETE FROM "Pagamento"           WHERE "lojaId" = 'loja-demo';
DELETE FROM "ComissaoFechamento"  WHERE "lojaId" = 'loja-demo';
DELETE FROM "ComissaoFaixa"       WHERE "lojaId" = 'loja-demo';
DELETE FROM "ComissaoRegra"       WHERE "lojaId" = 'loja-demo';
DELETE FROM "Parcela"             WHERE "lojaId" = 'loja-demo';
DELETE FROM "Contrato"            WHERE "lojaId" = 'loja-demo';
DELETE FROM "OrcamentoItem"       WHERE "lojaId" = 'loja-demo';
DELETE FROM "Orcamento"           WHERE "lojaId" = 'loja-demo';
DELETE FROM "Atendimento"         WHERE "lojaId" = 'loja-demo';
DELETE FROM "BloqueioVestido"     WHERE "lojaId" = 'loja-demo';
DELETE FROM "Reserva"             WHERE "lojaId" = 'loja-demo';
DELETE FROM "ContaPagar"          WHERE "lojaId" = 'loja-demo';
DELETE FROM "SalarioRecorrente"   WHERE "lojaId" = 'loja-demo';
DELETE FROM "LeadInteresse"       WHERE "leadId" IN (SELECT id FROM "Lead" WHERE "lojaId" = 'loja-demo');
DELETE FROM "Lead"                WHERE "lojaId" = 'loja-demo';
DELETE FROM "VestidoFoto"         WHERE "vestidoId" IN (SELECT id FROM "Vestido" WHERE "lojaId" = 'loja-demo');
DELETE FROM "Vestido"             WHERE "lojaId" = 'loja-demo';
DELETE FROM "Cabine"              WHERE "lojaId" = 'loja-demo';
DELETE FROM "RegraDisponibilidade" WHERE "lojaId" = 'loja-demo';
DELETE FROM "UsuarioLoja"         WHERE "usuarioId" LIKE 'demo-%';
DELETE FROM "Usuario"             WHERE id LIKE 'demo-%';

-- ── Loja (branding) ─────────────────────────────────────────────────────────
UPDATE "Loja" SET
  nome = 'Moscow Noivas — Atelier SP',
  cnpj = '34.512.890/0001-77',
  endereco = 'Rua Augusta, 1840 — Consolação, São Paulo/SP',
  telefone = '(11) 3251-7700',
  ativo = true, "updatedAt" = NOW()
WHERE id = 'loja-demo';

-- ── Super admin: reseta a senha para a senha demo conhecida ─────────────────
UPDATE "Usuario" SET nome = 'Camila Moscow (Proprietária)', "senhaHash" = :'hash', ativo = true, "updatedAt" = NOW()
WHERE id = 'super-admin';

-- ── Equipe ──────────────────────────────────────────────────────────────────
INSERT INTO "Usuario" (id, nome, email, "senhaHash", ativo, "isSuperAdmin", "updatedAt") VALUES
  ('demo-helena', 'Helena Prado',   'helena@moscownoivas.com', :'hash', true, false, NOW()),
  ('demo-marina', 'Marina Souza',   'marina@moscownoivas.com', :'hash', true, false, NOW()),
  ('demo-julia',  'Júlia Almeida',  'julia@moscownoivas.com',  :'hash', true, false, NOW()),
  ('demo-paula',  'Paula Ribeiro',  'paula@moscownoivas.com',  :'hash', true, false, NOW());

INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId") VALUES
  ('demo-helena', 'loja-demo', 'perfil-admin'),
  ('demo-marina', 'loja-demo', 'perfil-vendedora'),
  ('demo-julia',  'loja-demo', 'perfil-vendedora'),
  ('demo-paula',  'loja-demo', 'perfil-recepcao');

-- ── Cabines / Regra de disponibilidade ──────────────────────────────────────
INSERT INTO "Cabine" (id, "lojaId", nome, ativo, "updatedAt") VALUES
  ('demo-cab-1', 'loja-demo', 'Cabine 1',      true, NOW()),
  ('demo-cab-2', 'loja-demo', 'Cabine 2',      true, NOW()),
  ('demo-cab-3', 'loja-demo', 'Provador VIP',  true, NOW());

INSERT INTO "RegraDisponibilidade" (id, "lojaId") VALUES ('demo-regra', 'loja-demo');

-- ── Catálogo de vestidos ────────────────────────────────────────────────────
INSERT INTO "Vestido" (id, "lojaId", codigo, nome, "precoBase", tamanho, cor, categoria, status, "updatedAt") VALUES
  ('demo-v01','loja-demo','VEST-001','Sereia Veneza',      6800,'38','Off-white','Sereia',     'ativo', NOW()),
  ('demo-v02','loja-demo','VEST-002','Princesa Florença',  8200,'40','Branco',    'Princesa',   'ativo', NOW()),
  ('demo-v03','loja-demo','VEST-003','Tomara que Caia Lis',5400,'36','Off-white','Reto',       'ativo', NOW()),
  ('demo-v04','loja-demo','VEST-004','Renda Provence',     7300,'42','Marfim',    'Clássico',   'ativo', NOW()),
  ('demo-v05','loja-demo','VEST-005','Boho Toscana',       4900,'38','Champagne', 'Boho',       'ativo', NOW()),
  ('demo-v06','loja-demo','VEST-006','Império Sevilha',    6100,'40','Branco',    'Império',    'ativo', NOW()),
  ('demo-v07','loja-demo','VEST-007','Sereia Cetim Aurora',7900,'36','Off-white','Sereia',     'ativo', NOW()),
  ('demo-v08','loja-demo','VEST-008','Princesa Tule Estrela',8800,'44','Branco',  'Princesa',   'ativo', NOW()),
  ('demo-v09','loja-demo','VEST-009','Mini Civil Bardot',  3200,'38','Off-white','Civil',      'ativo', NOW()),
  ('demo-v10','loja-demo','VEST-010','Decote V Manhattan', 5600,'40','Marfim',    'Clássico',   'ativo', NOW()),
  ('demo-v11','loja-demo','VEST-011','Pluma Versalhes',    9500,'38','Branco',    'Alta-Costura','ativo', NOW()),
  ('demo-v12','loja-demo','VEST-012','Renda Manga Longa Íris',7100,'42','Marfim', 'Clássico',   'inativo', NOW());

-- ── Noivas (leads) em várias etapas da jornada ──────────────────────────────
INSERT INTO "Lead" (id, "lojaId", etapa, "noivaNome", "noivoNome", whatsapp, "casamentoData", "casamentoLocal", origem, "createdAt", "updatedAt") VALUES
  ('demo-lead-01','loja-demo','NOVO',                 'Aline Carvalho',  'Bruno Tavares',  '(11) 99812-3344', NOW()+interval '240 day','Espaço Jardim Europa',   'WHATSAPP', NOW()-interval '2 day',  NOW()),
  ('demo-lead-02','loja-demo','NOVO',                 'Bianca Moraes',   NULL,             '(11) 99745-1122', NOW()+interval '300 day','A definir',              'LOJA',     NOW()-interval '1 day',  NOW()),
  ('demo-lead-03','loja-demo','INTERESSES_PREENCHIDOS','Camila Nunes',   'Diego Farias',   '(11) 99633-8890', NOW()+interval '180 day','Casa das Caldeiras',     'WHATSAPP', NOW()-interval '6 day',  NOW()),
  ('demo-lead-04','loja-demo','ATENDIMENTO_AGENDADO', 'Daniela Rocha',   'Eduardo Lima',   '(11) 99521-4567', NOW()+interval '150 day','Quinta da Boa Vista',    'LOJA',     NOW()-interval '8 day',  NOW()),
  ('demo-lead-05','loja-demo','ATENDIMENTO_AGENDADO', 'Elisa Barros',    'Fábio Couto',    '(11) 99410-7788', NOW()+interval '120 day','Espaço Natália',         'WHATSAPP', NOW()-interval '10 day', NOW()),
  ('demo-lead-06','loja-demo','ORCAMENTO_ABERTO',     'Fernanda Dias',   'Gustavo Pires',  '(11) 99388-1290', NOW()+interval '110 day','Villa Bisutti',          'LOJA',     NOW()-interval '14 day', NOW()),
  ('demo-lead-07','loja-demo','CONTRATO_FECHADO',     'Gabriela Teixeira','Henrique Sá',   '(11) 99277-5566', NOW()+interval '95 day', 'Espaço Provence',        'WHATSAPP', NOW()-interval '20 day', NOW()),
  ('demo-lead-08','loja-demo','EM_PROVAS',            'Helena Castro',   'Igor Mendes',    '(11) 99166-3322', NOW()+interval '60 day', 'Buffet França',          'LOJA',     NOW()-interval '35 day', NOW()),
  ('demo-lead-09','loja-demo','EM_PROVAS',            'Isabela Freitas', 'João Vidal',     '(11) 99055-9911', NOW()+interval '45 day', 'Espaço Jardim Europa',   'WHATSAPP', NOW()-interval '40 day', NOW()),
  ('demo-lead-10','loja-demo','RETIRADO',             'Juliana Prado',   'Lucas Reis',     '(11) 98944-2200', NOW()+interval '12 day', 'Casa Charlô',            'LOJA',     NOW()-interval '70 day', NOW()),
  ('demo-lead-11','loja-demo','CASAMENTO_REALIZADO',  'Karina Lopes',    'Marcelo Antunes','(11) 98833-6677', NOW()-interval '20 day', 'Villa Bianca',           'WHATSAPP', NOW()-interval '120 day',NOW()),
  ('demo-lead-12','loja-demo','CASAMENTO_REALIZADO',  'Larissa Gomes',   'Nelson Vieira',  '(11) 98722-4455', NOW()-interval '45 day', 'Espaço Natália',         'LOJA',     NOW()-interval '140 day',NOW()),
  ('demo-lead-13','loja-demo','PERDIDO',              'Mariana Pinto',   NULL,             '(11) 98611-7733', NULL,                     NULL,                     'WHATSAPP', NOW()-interval '30 day', NOW()),
  ('demo-lead-14','loja-demo','NOVO',                 'Natália Cunha',   'Otávio Brandão', '(11) 98500-1199', NOW()+interval '260 day','A definir',              'LOJA',     NOW()-interval '3 day',  NOW()),
  ('demo-lead-15','loja-demo','ORCAMENTO_ABERTO',     'Olívia Martins',  'Pedro Galvão',   '(11) 98499-8800', NOW()+interval '130 day','Espaço Provence',        'WHATSAPP', NOW()-interval '16 day', NOW()),
  ('demo-lead-16','loja-demo','CONTRATO_FECHADO',     'Patrícia Ramos',  'Rafael Nóbrega', '(11) 98388-5511', NOW()+interval '88 day', 'Casa das Caldeiras',     'LOJA',     NOW()-interval '22 day', NOW());

-- Interesses (algumas noivas)
INSERT INTO "LeadInteresse" (id, "leadId", "algoAMais", "naoQuerUsar", "tetoOrcamento", "updatedAt") VALUES
  ('demo-int-03','demo-lead-03','Quer decote nas costas e cauda média','Brilho/pedraria em excesso', 7000, NOW()),
  ('demo-int-06','demo-lead-06','Estilo princesa, saia volumosa',      'Tomara que caia',            9000, NOW()),
  ('demo-int-08','demo-lead-08','Renda francesa e manga longa',         'Cetim liso',                 8000, NOW()),
  ('demo-int-15','demo-lead-15','Vestido leve para casamento na praia', 'Cauda longa',                6000, NOW());

-- ── Atendimentos do mês corrente (calendário) ───────────────────────────────
-- inicio = primeiro dia do mês + N dias + hora; mistura concluídos, hoje e futuros.
INSERT INTO "Atendimento" (id, "lojaId", "leadId", "cabineId", "vendedoraId", tipo, inicio, situacao, "atendidoEm", desfecho, observacao, "updatedAt") VALUES
  ('demo-at-01','loja-demo','demo-lead-11','demo-cab-1','demo-marina','PROVA',      date_trunc('month',NOW())+interval '2 day'  + interval '10 hour', 'CONCLUIDO',   date_trunc('month',NOW())+interval '2 day'+interval '10 hour','RESERVOU',  'Última prova antes da retirada', NOW()),
  ('demo-at-02','loja-demo','demo-lead-12','demo-cab-2','demo-julia', 'ATENDIMENTO',date_trunc('month',NOW())+interval '3 day'  + interval '14 hour', 'CONCLUIDO',   date_trunc('month',NOW())+interval '3 day'+interval '14 hour','RESERVOU',  NULL, NOW()),
  ('demo-at-03','loja-demo','demo-lead-13','demo-cab-1','demo-marina','ATENDIMENTO',date_trunc('month',NOW())+interval '5 day'  + interval '11 hour', 'CONCLUIDO',   date_trunc('month',NOW())+interval '5 day'+interval '11 hour','NAO_SERVIU','Não gostou dos modelos disponíveis', NOW()),
  ('demo-at-04','loja-demo','demo-lead-06','demo-cab-3','demo-helena','ATENDIMENTO',date_trunc('month',NOW())+interval '8 day'  + interval '16 hour', 'CONCLUIDO',   date_trunc('month',NOW())+interval '8 day'+interval '16 hour','VAI_PENSAR',NULL, NOW()),
  ('demo-at-05','loja-demo','demo-lead-08','demo-cab-1','demo-marina','PROVA',      date_trunc('month',NOW())+interval '12 day' + interval '15 hour', 'CONCLUIDO',   date_trunc('month',NOW())+interval '12 day'+interval '15 hour','RESERVOU', '2ª prova — ajuste de barra', NOW()),
  ('demo-at-06','loja-demo','demo-lead-04','demo-cab-2','demo-julia', 'ATENDIMENTO',NOW() + interval '2 hour',                                          'AGENDADO',    NULL, NULL, 'Primeiro atendimento', NOW()),
  ('demo-at-07','loja-demo','demo-lead-05','demo-cab-1','demo-marina','ATENDIMENTO',NOW() + interval '1 day' + interval '10 hour',                      'AGENDADO',    NULL, NULL, NULL, NOW()),
  ('demo-at-08','loja-demo','demo-lead-09','demo-cab-3','demo-helena','PROVA',      NOW() + interval '2 day' + interval '14 hour',                      'AGENDADO',    NULL, NULL, '3ª prova', NOW()),
  ('demo-at-09','loja-demo','demo-lead-07','demo-cab-2','demo-julia', 'PROVA',      NOW() + interval '4 day' + interval '11 hour',                      'AGENDADO',    NULL, NULL, '1ª prova', NOW()),
  ('demo-at-10','loja-demo','demo-lead-15','demo-cab-1','demo-marina','ATENDIMENTO',NOW() + interval '6 day' + interval '17 hour',                      'AGENDADO',    NULL, NULL, NULL, NOW());

-- ── Contratos fechados + parcelas ───────────────────────────────────────────
INSERT INTO "Contrato" (id, "lojaId", "leadId", "vendedoraId", status, cpf, "vestidoDescricao", "valorTotal", "formaPagamento", "dataCasamento", "dataRetirada", "dataDevolucao", "fechadoEm", "updatedAt") VALUES
  ('demo-ct-01','loja-demo','demo-lead-07','demo-marina','ATIVO','385.221.110-04','Sereia Cetim Aurora (VEST-007) + véu 3m',   9200, 'PIX',           NOW()+interval '95 day', NOW()+interval '88 day', NOW()+interval '99 day', NOW()-interval '20 day', NOW()),
  ('demo-ct-02','loja-demo','demo-lead-08','demo-julia', 'ATIVO','402.118.776-90','Renda Provence (VEST-004) + manga longa',   8600, 'CARTAO_CREDITO',NOW()+interval '60 day', NOW()+interval '53 day', NOW()+interval '64 day', NOW()-interval '35 day', NOW()),
  ('demo-ct-03','loja-demo','demo-lead-09','demo-marina','ATIVO','517.339.225-11','Boho Toscana (VEST-005)',                   5200, 'PIX',           NOW()+interval '45 day', NOW()+interval '38 day', NOW()+interval '49 day', NOW()-interval '40 day', NOW()),
  ('demo-ct-04','loja-demo','demo-lead-10','demo-helena','ATIVO','228.904.661-37','Princesa Tule Estrela (VEST-008)',          9800, 'BOLETO',        NOW()+interval '12 day', NOW()+interval '5 day',  NOW()+interval '16 day', NOW()-interval '70 day', NOW()),
  ('demo-ct-05','loja-demo','demo-lead-11','demo-marina','ATIVO','661.275.880-22','Pluma Versalhes (VEST-011)',                11200,'TRANSFERENCIA', NOW()-interval '20 day', NOW()-interval '27 day', NOW()-interval '16 day', NOW()-interval '110 day',NOW()),
  ('demo-ct-06','loja-demo','demo-lead-16','demo-julia', 'ATIVO','349.871.002-58','Decote V Manhattan (VEST-010)',             6400, 'CARTAO_CREDITO',NOW()+interval '88 day', NOW()+interval '81 day', NOW()+interval '92 day', NOW()-interval '22 day', NOW());

-- Parcelas: entrada PAGA + saldo PREVISTO (vencimentos relativos).
INSERT INTO "Parcela" (id, "lojaId", "contratoId", numero, descricao, "valorPrevisto", vencimento, status, "valorRecebido", "recebidoEm", "formaRecebimento") VALUES
  -- CT-01 (9200): 3x
  ('demo-pc-0101','loja-demo','demo-ct-01',1,'Entrada',          3200, NOW()-interval '20 day', 'PAGA',     3200, NOW()-interval '20 day','PIX'),
  ('demo-pc-0102','loja-demo','demo-ct-01',2,'Parcela 2/3',      3000, NOW()+interval '10 day', 'PREVISTA', NULL, NULL, NULL),
  ('demo-pc-0103','loja-demo','demo-ct-01',3,'Parcela 3/3',      3000, NOW()+interval '40 day', 'PREVISTA', NULL, NULL, NULL),
  -- CT-02 (8600): 4x cartão
  ('demo-pc-0201','loja-demo','demo-ct-02',1,'Entrada',          2600, NOW()-interval '35 day', 'PAGA',     2600, NOW()-interval '35 day','CARTAO_CREDITO'),
  ('demo-pc-0202','loja-demo','demo-ct-02',2,'Parcela 2/4',      2000, NOW()-interval '5 day',  'PAGA',     2000, NOW()-interval '4 day', 'CARTAO_CREDITO'),
  ('demo-pc-0203','loja-demo','demo-ct-02',3,'Parcela 3/4',      2000, NOW()+interval '25 day', 'PREVISTA', NULL, NULL, NULL),
  ('demo-pc-0204','loja-demo','demo-ct-02',4,'Parcela 4/4',      2000, NOW()+interval '55 day', 'PREVISTA', NULL, NULL, NULL),
  -- CT-03 (5200): 2x
  ('demo-pc-0301','loja-demo','demo-ct-03',1,'Entrada',          2600, NOW()-interval '40 day', 'PAGA',     2600, NOW()-interval '40 day','PIX'),
  ('demo-pc-0302','loja-demo','demo-ct-03',2,'Saldo',            2600, NOW()+interval '15 day', 'PREVISTA', NULL, NULL, NULL),
  -- CT-04 (9800): 3x
  ('demo-pc-0401','loja-demo','demo-ct-04',1,'Entrada',          3800, NOW()-interval '70 day', 'PAGA',     3800, NOW()-interval '70 day','BOLETO'),
  ('demo-pc-0402','loja-demo','demo-ct-04',2,'Parcela 2/3',      3000, NOW()-interval '10 day', 'PAGA',     3000, NOW()-interval '9 day', 'BOLETO'),
  ('demo-pc-0403','loja-demo','demo-ct-04',3,'Parcela 3/3 (retirada)',3000, NOW()+interval '5 day','PREVISTA', NULL, NULL, NULL),
  -- CT-05 (11200): quitado
  ('demo-pc-0501','loja-demo','demo-ct-05',1,'Entrada',          5200, NOW()-interval '110 day','PAGA',     5200, NOW()-interval '110 day','TRANSFERENCIA'),
  ('demo-pc-0502','loja-demo','demo-ct-05',2,'Saldo',            6000, NOW()-interval '30 day', 'PAGA',     6000, NOW()-interval '30 day','TRANSFERENCIA'),
  -- CT-06 (6400): 3x
  ('demo-pc-0601','loja-demo','demo-ct-06',1,'Entrada',          2400, NOW()-interval '22 day', 'PAGA',     2400, NOW()-interval '22 day','CARTAO_CREDITO'),
  ('demo-pc-0602','loja-demo','demo-ct-06',2,'Parcela 2/3',      2000, NOW()+interval '8 day',  'PREVISTA', NULL, NULL, NULL),
  ('demo-pc-0603','loja-demo','demo-ct-06',3,'Parcela 3/3',      2000, NOW()+interval '38 day', 'PREVISTA', NULL, NULL, NULL);

-- ── Reservas ────────────────────────────────────────────────────────────────
INSERT INTO "Reserva" (id, "lojaId", "leadId", "casamentoData", status, "updatedAt") VALUES
  ('demo-rs-01','loja-demo','demo-lead-08', NOW()+interval '60 day', 'CONFIRMADA',  NOW()),
  ('demo-rs-02','loja-demo','demo-lead-09', NOW()+interval '45 day', 'EM_MONTAGEM', NOW());

-- ── Orçamentos abertos + itens ──────────────────────────────────────────────
INSERT INTO "Orcamento" (id, "lojaId", "leadId", "vendedoraId", status, "descontoTipo", "descontoValor", validade, observacoes, "updatedAt") VALUES
  ('demo-or-06','loja-demo','demo-lead-06','demo-helena','ENVIADO',   'PERCENTUAL', 5,  NOW()+interval '15 day','Cliente quer princesa volumoso', NOW()),
  ('demo-or-15','loja-demo','demo-lead-15','demo-marina','RASCUNHO',  NULL,         NULL,NOW()+interval '20 day','Casamento na praia, vestido leve', NOW());

INSERT INTO "OrcamentoItem" (id, "lojaId", "orcamentoId", tipo, "vestidoId", descricao, "valorUnitario", quantidade) VALUES
  ('demo-oi-0601','loja-demo','demo-or-06','VESTIDO','demo-v08','Princesa Tule Estrela (VEST-008)', 8800, 1),
  ('demo-oi-0602','loja-demo','demo-or-06','SERVICO', NULL,     'Véu catedral 3m',                  600,  1),
  ('demo-oi-0603','loja-demo','demo-or-06','AJUSTE',  NULL,     'Ajuste de barra e cintura',        350,  1),
  ('demo-oi-1501','loja-demo','demo-or-15','VESTIDO','demo-v05','Boho Toscana (VEST-005)',          4900, 1),
  ('demo-oi-1502','loja-demo','demo-or-15','SERVICO', NULL,     'Tiara de flores',                  280,  1);

-- ── Contas a pagar ──────────────────────────────────────────────────────────
INSERT INTO "ContaPagar" (id, "lojaId", tipo, descricao, categoria, fornecedor, competencia, "valorPrevisto", vencimento, status) VALUES
  ('demo-cp-01','loja-demo','DESPESA',   'Aluguel da loja',          'Ocupação',  'Imobiliária Augusta', to_char(NOW(),'YYYY-MM'), 7800, date_trunc('month',NOW())+interval '9 day',  'PAGA'),
  ('demo-cp-02','loja-demo','DESPESA',   'Energia elétrica',         'Utilidades','Enel',                 to_char(NOW(),'YYYY-MM'), 940,  date_trunc('month',NOW())+interval '14 day', 'PREVISTA'),
  ('demo-cp-03','loja-demo','FORNECEDOR', 'Tecidos e rendas importadas','Insumos','Atelier Tecidos Ltda', to_char(NOW(),'YYYY-MM'), 4200, NOW()+interval '7 day',  'PREVISTA'),
  ('demo-cp-04','loja-demo','DESPESA',   'Marketing / Instagram Ads','Marketing','Meta Platforms',        to_char(NOW(),'YYYY-MM'), 1500, NOW()+interval '3 day',  'PREVISTA'),
  ('demo-cp-05','loja-demo','FORNECEDOR', 'Lavanderia especializada', 'Serviços', 'Lave Bem Noivas',       to_char(NOW(),'YYYY-MM'), 680,  NOW()-interval '2 day',  'PAGA'),
  ('demo-cp-06','loja-demo','SALARIO',    'Salário — Marina Souza',   'Pessoal',  NULL,                    to_char(NOW(),'YYYY-MM'), 2800, date_trunc('month',NOW())+interval '4 day',  'PAGA');
UPDATE "ContaPagar" SET "colaboradorId" = 'demo-marina' WHERE id = 'demo-cp-06';

-- ── Salários recorrentes ────────────────────────────────────────────────────
INSERT INTO "SalarioRecorrente" (id, "lojaId", "colaboradorId", "valorBase", "diaVencimento", ativo, "updatedAt") VALUES
  ('demo-sal-1','loja-demo','demo-marina', 2800, 5, true, NOW()),
  ('demo-sal-2','loja-demo','demo-julia',  2800, 5, true, NOW()),
  ('demo-sal-3','loja-demo','demo-paula',  2400, 5, true, NOW()),
  ('demo-sal-4','loja-demo','demo-helena', 4200, 5, true, NOW());

-- ── Comissões: regra + faixas + fechamentos ─────────────────────────────────
INSERT INTO "ComissaoRegra" (id, "lojaId", "vendedoraId", "vigenciaInicio", "bonusAcumulaFaixas", ativo, "updatedAt") VALUES
  ('demo-cr-1','loja-demo','demo-marina', date_trunc('year',NOW()), false, true, NOW()),
  ('demo-cr-2','loja-demo','demo-julia',  date_trunc('year',NOW()), false, true, NOW());

INSERT INTO "ComissaoFaixa" (id, "lojaId", "regraId", "minAcumulado", "maxAcumulado", percentual, "bonusFixo") VALUES
  ('demo-cf-1a','loja-demo','demo-cr-1', 0,     20000, 3, NULL),
  ('demo-cf-1b','loja-demo','demo-cr-1', 20000, NULL,  5, 500),
  ('demo-cf-2a','loja-demo','demo-cr-2', 0,     20000, 3, NULL),
  ('demo-cf-2b','loja-demo','demo-cr-2', 20000, NULL,  5, 500);

INSERT INTO "ComissaoFechamento" (id, "lojaId", "vendedoraId", competencia, "totalVendas", "percentualAplicado", "valorComissao", "valorBonus", "valorTotal", "fechadoEm") VALUES
  ('demo-cmf-1','loja-demo','demo-marina', to_char(NOW()-interval '1 month','YYYY-MM'), 25600, 5, 1280, 500, 1780, NOW()-interval '20 day'),
  ('demo-cmf-2','loja-demo','demo-julia',  to_char(NOW()-interval '1 month','YYYY-MM'), 15000, 3, 450,  0,   450,  NOW()-interval '20 day');

COMMIT;

-- ── Resumo ──────────────────────────────────────────────────────────────────
\echo '── Seed demo aplicado. Contagens da loja-demo: ──'
SELECT 'noivas'      AS entidade, COUNT(*) FROM "Lead"        WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'vestidos',      COUNT(*) FROM "Vestido"     WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'atendimentos',  COUNT(*) FROM "Atendimento" WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'contratos',     COUNT(*) FROM "Contrato"    WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'parcelas',      COUNT(*) FROM "Parcela"     WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'contas_pagar',  COUNT(*) FROM "ContaPagar"  WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'reservas',      COUNT(*) FROM "Reserva"     WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'orcamentos',    COUNT(*) FROM "Orcamento"   WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'comissoes',     COUNT(*) FROM "ComissaoFechamento" WHERE "lojaId"='loja-demo'
UNION ALL SELECT 'equipe',        COUNT(*) FROM "UsuarioLoja" WHERE "lojaId"='loja-demo';
