-- Dados de teste mínimos
INSERT OR IGNORE INTO funcoes (id, nome) VALUES (1, 'Piloto');
INSERT OR IGNORE INTO setores (id, nome) VALUES (1, 'Operações');
INSERT OR IGNORE INTO empresas (id, nome, cnpj) VALUES (1, 'Empresa Teste', '00.000.000/0001-00');
INSERT OR IGNORE INTO manobras (id, codigo, nome, categoria) VALUES (1, 'MAN-001', 'Manobra 1', 'Categoria A');
INSERT OR IGNORE INTO manobras (id, codigo, nome, categoria) VALUES (2, 'MAN-002', 'Manobra 2', 'Categoria B');
INSERT OR IGNORE INTO treinamentos (id, codigo, nome, categoria_id) VALUES (1, 'TRE-001', 'Treinamento 1', 1);
