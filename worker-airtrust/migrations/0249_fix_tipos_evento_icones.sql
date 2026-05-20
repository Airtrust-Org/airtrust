-- Fix tipos evento icons: replace Material icon names with emoji
UPDATE escalas_tipos_evento_config SET icone = '✈'  WHERE codigo = 'VOO';
UPDATE escalas_tipos_evento_config SET icone = '🧳'  WHERE codigo = 'VIM';
UPDATE escalas_tipos_evento_config SET icone = '📚'  WHERE codigo = 'TSO';
UPDATE escalas_tipos_evento_config SET icone = '🖥'  WHERE codigo = 'SIM';
UPDATE escalas_tipos_evento_config SET icone = '🏥'  WHERE codigo = 'MED';
UPDATE escalas_tipos_evento_config SET icone = '✅'  WHERE codigo = 'CHK';
UPDATE escalas_tipos_evento_config SET icone = '🔄'  WHERE codigo = 'REA';
UPDATE escalas_tipos_evento_config SET icone = '💼'  WHERE codigo = 'TRB';
UPDATE escalas_tipos_evento_config SET icone = '🏖'  WHERE codigo = 'FOL';
UPDATE escalas_tipos_evento_config SET icone = '📡'  WHERE codigo = 'SMH';
UPDATE escalas_tipos_evento_config SET icone = '🌴'  WHERE codigo = 'FER';
UPDATE escalas_tipos_evento_config SET icone = '📋'  WHERE codigo = 'LIC';
