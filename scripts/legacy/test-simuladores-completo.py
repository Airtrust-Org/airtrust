#!/usr/bin/env python3
"""
Teste Completo - Módulo Simuladores
Valida todos os botões e endpoints do frontend
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime

# Cores ANSI
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
PURPLE = '\033[95m'
CYAN = '\033[96m'
BOLD = '\033[1m'
RESET = '\033[0m'

def print_header(text):
    print(f"\n{BOLD}{CYAN}{'='*80}{RESET}")
    print(f"{BOLD}{CYAN}{text.center(80)}{RESET}")
    print(f"{BOLD}{CYAN}{'='*80}{RESET}\n")

def print_test(num, name, status, details=""):
    status_color = GREEN if status == "✅" else RED if status == "❌" else YELLOW
    print(f"{BOLD}[Teste {num}]{RESET} {name}... {status_color}{status}{RESET}")
    if details:
        print(f"          {details}")

def check_file_content(filepath, pattern, description):
    """Verifica se um padrão existe no arquivo"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            matches = re.findall(pattern, content, re.MULTILINE)
            return len(matches) > 0, len(matches), content
    except FileNotFoundError:
        return False, 0, ""
    except Exception as e:
        return False, 0, str(e)

def main():
    print_header("🧪 TESTE COMPLETO - MÓDULO SIMULADORES")
    print(f"{BLUE}Data/Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}{RESET}")
    print(f"{BLUE}Diretório: {os.getcwd()}{RESET}\n")

    base_path = Path("/Users/filipedaumas/Documents/airtrust v1")
    os.chdir(base_path)

    total_tests = 0
    passed_tests = 0
    failed_tests = 0

    # =============================================================================
    # TESTE 1: SimuladoresWrapper.tsx - Botão "Gerenciar"
    # =============================================================================
    total_tests += 1
    file_path = "src/react-app/pages/simuladores/SimuladoresWrapper.tsx"
    pattern = r"onClick=\{\(\) => navigate\('/simuladores/cadastros/simuladores'\)\}"
    
    found, count, content = check_file_content(file_path, pattern, "Botão Gerenciar")
    
    if found:
        print_test(1, "Botão 'Gerenciar' com navigate()", "✅", 
                  f"Encontrado {count}x em SimuladoresWrapper.tsx")
        passed_tests += 1
    else:
        print_test(1, "Botão 'Gerenciar' com navigate()", "❌", 
                  "Pattern não encontrado no arquivo")
        failed_tests += 1

    # =============================================================================
    # TESTE 2: SimuladoresWrapper.tsx - Botão "Configurar"
    # =============================================================================
    total_tests += 1
    pattern = r"onClick=\{\(\) => navigate\('/simuladores/cadastros/templates'\)\}"
    
    found, count, _ = check_file_content(file_path, pattern, "Botão Configurar")
    
    if found:
        print_test(2, "Botão 'Configurar' com navigate()", "✅", 
                  f"Encontrado {count}x em SimuladoresWrapper.tsx")
        passed_tests += 1
    else:
        print_test(2, "Botão 'Configurar' com navigate()", "❌", 
                  "Pattern não encontrado no arquivo")
        failed_tests += 1

    # =============================================================================
    # TESTE 3: SimuladoresWrapper.tsx - Botão "Ver Relatórios"
    # =============================================================================
    total_tests += 1
    pattern = r"onClick=\{\(\) => navigate\('/simuladores/relatorios'\)\}"
    
    found, count, _ = check_file_content(file_path, pattern, "Botão Ver Relatórios")
    
    if found:
        print_test(3, "Botão 'Ver Relatórios' com navigate()", "✅", 
                  f"Encontrado {count}x em SimuladoresWrapper.tsx")
        passed_tests += 1
    else:
        print_test(3, "Botão 'Ver Relatórios' com navigate()", "❌", 
                  "Pattern não encontrado no arquivo")
        failed_tests += 1

    # =============================================================================
    # TESTE 4: FichasTab.tsx - Import useNavigate
    # =============================================================================
    total_tests += 1
    file_path = "src/react-app/pages/simuladores/tabs/FichasTab.tsx"
    pattern = r"import.*useNavigate.*from.*react-router-dom"
    
    found, count, _ = check_file_content(file_path, pattern, "Import useNavigate")
    
    if found:
        print_test(4, "FichasTab: import useNavigate", "✅", 
                  "Import correto encontrado")
        passed_tests += 1
    else:
        print_test(4, "FichasTab: import useNavigate", "❌", 
                  "Import não encontrado")
        failed_tests += 1

    # =============================================================================
    # TESTE 5: FichasTab.tsx - Botão Ver (Eye)
    # =============================================================================
    total_tests += 1
    pattern = r"onClick=\{\(\) => navigate\(`/simuladores/fichas/\$\{ficha\.id\}`\)\}"
    
    found, count, content = check_file_content(file_path, pattern, "Botão Ver")
    
    if found:
        print_test(5, "FichasTab: Botão Ver (Eye)", "✅", 
                  f"Encontrado {count}x em FichasTab.tsx")
        passed_tests += 1
    else:
        # Tentar pattern alternativo
        pattern_alt = r"navigate\(`/simuladores/fichas/\$\{.*?\}`\)"
        found_alt, count_alt, _ = check_file_content(file_path, pattern_alt, "Botão Ver (alt)")
        if found_alt:
            print_test(5, "FichasTab: Botão Ver (Eye)", "✅", 
                      f"Encontrado {count_alt}x com pattern alternativo")
            passed_tests += 1
        else:
            print_test(5, "FichasTab: Botão Ver (Eye)", "❌", 
                      "Pattern não encontrado")
            failed_tests += 1

    # =============================================================================
    # TESTE 6: FichasTab.tsx - Botão PDF (Download)
    # =============================================================================
    total_tests += 1
    pattern = r"window\.open\(`/api/simuladores/fichas-simulador/\$\{ficha\.id\}/gerar-pdf`"
    
    found, count, _ = check_file_content(file_path, pattern, "Botão PDF")
    
    if found:
        print_test(6, "FichasTab: Botão PDF (Download)", "✅", 
                  f"Encontrado {count}x em FichasTab.tsx")
        passed_tests += 1
    else:
        print_test(6, "FichasTab: Botão PDF (Download)", "❌", 
                  "Pattern não encontrado")
        failed_tests += 1

    # =============================================================================
    # TESTE 7: RelatoriosSimuladores.tsx - Arquivo existe
    # =============================================================================
    total_tests += 1
    file_path = "src/react-app/pages/simuladores/RelatoriosSimuladores.tsx"
    
    if os.path.exists(file_path):
        file_size = os.path.getsize(file_path)
        lines = len(open(file_path, 'r', encoding='utf-8').readlines())
        print_test(7, "Arquivo RelatoriosSimuladores.tsx", "✅", 
                  f"Existe: {file_size} bytes, {lines} linhas")
        passed_tests += 1
    else:
        print_test(7, "Arquivo RelatoriosSimuladores.tsx", "❌", 
                  "Arquivo não encontrado")
        failed_tests += 1

    # =============================================================================
    # TESTE 8: App.tsx - Rota /simuladores/relatorios
    # =============================================================================
    total_tests += 1
    file_path = "src/react-app/App.tsx"
    pattern = r"path=\"/simuladores/relatorios\""
    
    found, count, _ = check_file_content(file_path, pattern, "Rota relatórios")
    
    if found:
        print_test(8, "App.tsx: Rota /simuladores/relatorios", "✅", 
                  "Rota registrada corretamente")
        passed_tests += 1
    else:
        print_test(8, "App.tsx: Rota /simuladores/relatorios", "❌", 
                  "Rota não encontrada")
        failed_tests += 1

    # =============================================================================
    # TESTE 9: App.tsx - Lazy import RelatoriosSimuladores
    # =============================================================================
    total_tests += 1
    pattern = r"const RelatoriosSimuladores = lazy\(\(\) => import\('\.\/pages\/simuladores\/RelatoriosSimuladores'\)\)"
    
    found, count, _ = check_file_content(file_path, pattern, "Lazy import")
    
    if found:
        print_test(9, "App.tsx: Lazy import RelatoriosSimuladores", "✅", 
                  "Import lazy configurado")
        passed_tests += 1
    else:
        print_test(9, "App.tsx: Lazy import RelatoriosSimuladores", "❌", 
                  "Import não encontrado")
        failed_tests += 1

    # =============================================================================
    # TESTE 10: Verificar timestamps dos arquivos
    # =============================================================================
    total_tests += 1
    files_to_check = [
        "src/react-app/pages/simuladores/SimuladoresWrapper.tsx",
        "src/react-app/pages/simuladores/tabs/FichasTab.tsx",
        "src/react-app/pages/simuladores/RelatoriosSimuladores.tsx"
    ]
    
    all_recent = True
    today = datetime.now().date()
    
    for file in files_to_check:
        if os.path.exists(file):
            mtime = os.path.getmtime(file)
            file_date = datetime.fromtimestamp(mtime).date()
            if file_date != today:
                all_recent = False
                break
    
    if all_recent:
        print_test(10, "Timestamps dos arquivos", "✅", 
                  "Todos os arquivos foram modificados hoje")
        passed_tests += 1
    else:
        print_test(10, "Timestamps dos arquivos", "⚠️", 
                  "Alguns arquivos podem estar desatualizados")
        failed_tests += 1

    # =============================================================================
    # RESUMO FINAL
    # =============================================================================
    print_header("📊 RESUMO DOS TESTES")
    
    success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
    
    print(f"{BOLD}Total de Testes:{RESET}     {total_tests}")
    print(f"{GREEN}{BOLD}✅ Passou:{RESET}          {passed_tests}")
    print(f"{RED}{BOLD}❌ Falhou:{RESET}          {failed_tests}")
    print(f"{BOLD}Taxa de Sucesso:{RESET}   {success_rate:.1f}%\n")

    if failed_tests == 0:
        print(f"{GREEN}{BOLD}🎉 TODOS OS TESTES PASSARAM!{RESET}")
        print(f"{YELLOW}⚠️  Se ainda não está funcionando no navegador, faça:{RESET}")
        print(f"{CYAN}   1. Cmd+Shift+R (Mac) ou Ctrl+Shift+R (Windows){RESET}")
        print(f"{CYAN}   2. Ou abra em aba anônima{RESET}")
        print(f"{CYAN}   3. Acesse: http://localhost:3000/simuladores{RESET}\n")
    else:
        print(f"{RED}{BOLD}❌ ALGUNS TESTES FALHARAM{RESET}")
        print(f"{YELLOW}Verifique os erros acima e corrija os problemas.{RESET}\n")

    return 0 if failed_tests == 0 else 1

if __name__ == "__main__":
    exit(main())
