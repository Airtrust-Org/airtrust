-- Verificar funcionários do CSV que existem no AirTrust
SELECT id, nome, email 
FROM funcionarios 
WHERE email IN (
  'adriana.brasil@voecostadosol.com.br',
  'antonio.ramos@voecostadosol.com.br',
  'antunes.bernardo@voecostadosol.com.br',
  'carlos.castro@voecostadosol.com.br',
  'diego.benjamin@voecostadosol.com.br',
  'eduardo.raposo@voecostadosol.com.br',
  'eduardo.ribeiro@voecostadosol.com.br',
  'fernando.filho@voecostadosol.com.br',
  'flavio.belmont@voecostadosol.com.br',
  'gabriel.barreto@voecostadosol.com.br',
  'gustavo.oliveira@voecostadosol.com.br',
  'jair.silva@voecostadosol.com.br',
  'jether.junior@voecostadosol.com.br',
  'katia.santana@voecostadosol.com.br',
  'priscila.lima@voecostadosol.com.br',
  'robson.oliveira@voecostadosol.com.br',
  'theison.lopes@voecostadosol.com.br',
  'thiago.tavares@voecostadosol.com.br',
  'tulio.marques@voecostadosol.com.br',
  'vitor.costa@voecostadosol.com.br',
  'yngrid.fonseca@voecostadosol.com.br'
)
AND deleted_at IS NULL
ORDER BY nome;
