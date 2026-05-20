-- Eventos Abril 2026 - Tripulação A (Antonio PIC / Caio SIC)
INSERT OR IGNORE INTO escala_eventos (id,escala_id,tripulacao_id,funcionario_id,tipo_evento,data_inicio,data_fim,turno,local,aeronave,status,created_at,updated_at) VALUES
('ev-abr-01','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','voo','2026-04-01','2026-04-03','dia_todo','Macaé/Vitória','PP-HMR','confirmado',datetime('now'),datetime('now')),
('ev-abr-02','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','folga','2026-04-04','2026-04-06','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-03','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','voo','2026-04-07','2026-04-10','dia_todo','Macaé/RJ','PP-HMR','confirmado',datetime('now'),datetime('now')),
('ev-abr-04','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','medico','2026-04-14','2026-04-14','manha','Rio de Janeiro',NULL,'pendente',datetime('now'),datetime('now')),
('ev-abr-05','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','treinamento_simulador','2026-04-17','2026-04-18','dia_todo','GRU - CAE',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-06','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','folga','2026-04-19','2026-04-21','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-07','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','trabalho','2026-04-22','2026-04-26','dia_todo','Macaé','PP-HMR','confirmado',datetime('now'),datetime('now')),
('ev-abr-08','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','3','standby','2026-04-28','2026-04-30','noite','Macaé',NULL,'confirmado',datetime('now'),datetime('now'));

-- Eventos Abril 2026 - SIC Caio
INSERT OR IGNORE INTO escala_eventos (id,escala_id,tripulacao_id,funcionario_id,tipo_evento,data_inicio,data_fim,turno,local,aeronave,status,created_at,updated_at) VALUES
('ev-abr-09','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','5','ferias','2026-04-01','2026-04-15','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-10','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','5','voo','2026-04-16','2026-04-18','dia_todo','Macaé','PP-HMR','confirmado',datetime('now'),datetime('now')),
('ev-abr-11','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','5','treinamento_solo','2026-04-22','2026-04-22','manha','Base Macaé',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-12','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-a','5','cheque','2026-04-25','2026-04-25','tarde','Base Macaé',NULL,'pendente',datetime('now'),datetime('now'));

-- Eventos Abril 2026 - Tripulação B (Dieter PIC / Eduardo SIC)
INSERT OR IGNORE INTO escala_eventos (id,escala_id,tripulacao_id,funcionario_id,tipo_evento,data_inicio,data_fim,turno,local,aeronave,status,created_at,updated_at) VALUES
('ev-abr-13','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','7','voo','2026-04-02','2026-04-05','dia_todo','Vitória/RJ','PP-HXY','confirmado',datetime('now'),datetime('now')),
('ev-abr-14','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','7','licenca','2026-04-08','2026-04-10','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-15','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','7','viagem','2026-04-14','2026-04-16','dia_todo','Brasília',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-16','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','7','voo','2026-04-21','2026-04-25','dia_todo','Vitória','PP-HXY','confirmado',datetime('now'),datetime('now')),
('ev-abr-17','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','7','folga','2026-04-27','2026-04-30','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-18','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','8','trabalho','2026-04-01','2026-04-05','dia_todo','Vitória','PP-HXY','confirmado',datetime('now'),datetime('now')),
('ev-abr-19','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','8','folga','2026-04-06','2026-04-07','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-20','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','8','treinamento_simulador','2026-04-10','2026-04-11','dia_todo','GRU - CAE',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-21','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','8','standby','2026-04-15','2026-04-15','noite','Vitória',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-abr-22','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','8','voo','2026-04-17','2026-04-21','dia_todo','Vitória/RJ','PP-HXY','confirmado',datetime('now'),datetime('now')),
('ev-abr-23','c16eccf1-5df5-4982-b28d-153ae12e07ca','trip-abr26-b','8','ferias','2026-04-27','2026-04-30','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now'));

-- Eventos Março 2026 - Tripulação A (Adriana PIC / Carlos SIC)
INSERT OR IGNORE INTO escala_eventos (id,escala_id,tripulacao_id,funcionario_id,tipo_evento,data_inicio,data_fim,turno,local,aeronave,status,created_at,updated_at) VALUES
('ev-mar-01','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','1','voo','2026-03-01','2026-03-05','dia_todo','Macaé/Vitória','PP-HMZ','confirmado',datetime('now'),datetime('now')),
('ev-mar-02','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','1','folga','2026-03-06','2026-03-09','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-mar-03','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','1','medico','2026-03-10','2026-03-10','manha','Rio de Janeiro',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-mar-04','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','1','treinamento_simulador','2026-03-15','2026-03-16','dia_todo','GRU - CAE',NULL,'confirmado',datetime('now'),datetime('now')),
('ev-mar-05','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','1','voo','2026-03-20','2026-03-25','dia_todo','Macaé/RJ','PP-HMZ','confirmado',datetime('now'),datetime('now')),
('ev-mar-06','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','6','folga','2026-03-01','2026-03-03','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now')),
('ev-mar-07','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','6','voo','2026-03-04','2026-03-09','dia_todo','Macaé/Vitória','PP-HMZ','confirmado',datetime('now'),datetime('now')),
('ev-mar-08','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','6','cheque','2026-03-15','2026-03-15','tarde','Base Macaé',NULL,'pendente',datetime('now'),datetime('now')),
('ev-mar-09','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','6','voo','2026-03-18','2026-03-23','dia_todo','Macaé/RJ','PP-HMZ','confirmado',datetime('now'),datetime('now')),
('ev-mar-10','03f1ca12-15fe-4bff-ac52-987baf8a2dea','trip-mar26-a','6','ferias','2026-03-28','2026-03-31','dia_todo',NULL,NULL,'confirmado',datetime('now'),datetime('now'));
