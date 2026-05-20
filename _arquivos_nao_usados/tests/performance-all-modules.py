#!/usr/bin/env python3
"""
Performance Test Suite - All Modules
Tests response times, cache hit rates across all endpoints
Date: 2025-11-06
"""

import requests
import time
import json
from datetime import datetime
from collections import defaultdict
import statistics

BASE_URL = "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"

# Color codes
GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'

class PerformanceTester:
    def __init__(self):
        self.results = defaultdict(list)
        self.endpoints = []
        
    def add_endpoint(self, name, method, path, expected_code=200):
        """Add endpoint to test"""
        self.endpoints.append({
            'name': name,
            'method': method,
            'path': path,
            'expected': expected_code
        })
    
    def test_endpoint(self, endpoint, iterations=3):
        """Test single endpoint multiple times"""
        name = endpoint['name']
        url = f"{BASE_URL}{endpoint['path']}"
        method = endpoint['method']
        expected = endpoint['expected']
        
        print(f"Testing {name}...", end=" ", flush=True)
        
        times = []
        cache_hits = 0
        
        try:
            for i in range(iterations):
                start = time.time()
                
                if method == "GET":
                    response = requests.get(url, timeout=10)
                else:
                    response = requests.request(method, url, timeout=10)
                
                elapsed = (time.time() - start) * 1000  # Convert to ms
                times.append(elapsed)
                
                # Check cache header
                cache_header = response.headers.get('X-Cache', 'MISS')
                if cache_header == 'HIT':
                    cache_hits += 1
                
                # Check status code
                if response.status_code != expected:
                    print(f"{RED}❌ HTTP {response.status_code} (Expected {expected}){NC}")
                    return False
        
        except requests.exceptions.Timeout:
            print(f"{RED}❌ TIMEOUT{NC}")
            return False
        except Exception as e:
            print(f"{RED}❌ ERROR: {str(e)}{NC}")
            return False
        
        # Store results
        avg_time = statistics.mean(times)
        cache_rate = (cache_hits / iterations) * 100
        
        self.results[name] = {
            'times': times,
            'avg': avg_time,
            'min': min(times),
            'max': max(times),
            'cache_hits': cache_hits,
            'cache_rate': cache_rate,
            'status_code': response.status_code
        }
        
        # Print result
        if avg_time < 100:
            status = f"{GREEN}EXCELLENT{NC}"
        elif avg_time < 300:
            status = f"{GREEN}GOOD{NC}"
        elif avg_time < 500:
            status = f"{YELLOW}OK{NC}"
        else:
            status = f"{RED}SLOW{NC}"
        
        print(f"{status}")
        return True
    
    def run_all(self):
        """Run all tests"""
        print("╔════════════════════════════════════════════════════════════════╗")
        print("║     AIRTRUST PERFORMANCE TEST - ALL MODULES                    ║")
        print("║                                                                ║")
        print("║  Testing: Response Time, Cache Hits, Load Analysis             ║")
        print("╚════════════════════════════════════════════════════════════════╝")
        print()
        
        # Test each endpoint
        for endpoint in self.endpoints:
            self.test_endpoint(endpoint)
        
        print()
        self.print_analysis()
        self.save_report()
    
    def print_analysis(self):
        """Print performance analysis"""
        print()
        print("╔════════════════════════════════════════════════════════════════╗")
        print("║                   PERFORMANCE ANALYSIS                         ║")
        print("╚════════════════════════════════════════════════════════════════╝")
        print()
        
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"{'ENDPOINT':<40} | {'AVG TIME':<10} | {'CACHE':<8} | {'STATUS':<10}")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        stats_by_category = defaultdict(list)
        
        for name, data in sorted(self.results.items()):
            avg_time = data['avg']
            cache_rate = data['cache_rate']
            
            if avg_time < 100:
                status = f"{GREEN}EXCELLENT{NC}"
                category = 'excellent'
            elif avg_time < 300:
                status = f"{GREEN}GOOD{NC}"
                category = 'good'
            elif avg_time < 500:
                status = f"{YELLOW}OK{NC}"
                category = 'ok'
            else:
                status = f"{RED}SLOW{NC}"
                category = 'slow'
            
            stats_by_category[category].append(name)
            
            print(f"{name:<40} | {avg_time:>8.1f}ms | {cache_rate:>5.0f}% | {status}")
        
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print()
        
        # Summary
        print("📊 SUMMARY")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"Total Endpoints Tested: {len(self.results)}")
        print(f"  {GREEN}Excellent (< 100ms):{NC}   {len(stats_by_category['excellent'])}")
        print(f"  {GREEN}Good (100-300ms):{NC}     {len(stats_by_category['good'])}")
        print(f"  {YELLOW}OK (300-500ms):{NC}        {len(stats_by_category['ok'])}")
        print(f"  {RED}Slow (> 500ms):{NC}       {len(stats_by_category['slow'])}")
        print()
        
        # Cache analysis
        total_cache_hits = sum(data['cache_hits'] for data in self.results.values())
        total_requests = len(self.results) * 3
        cache_effectiveness = (total_cache_hits / total_requests * 100) if total_requests > 0 else 0
        
        print("💾 CACHE EFFECTIVENESS")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"Total Requests: {total_requests}")
        print(f"Cache Hits: {total_cache_hits}")
        print(f"Hit Rate: {cache_effectiveness:.1f}%")
        print()
        
        # Module breakdown
        print("📦 PERFORMANCE BY MODULE")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        modules = {}
        for name, data in self.results.items():
            # Extract module from name
            if 'Qualificacoes' in name or 'Qualificações' in name:
                mod = 'Qualificacoes'
            elif 'Habilitacoes' in name or 'Habilitações' in name:
                mod = 'Habilitacoes'
            elif 'Simulador' in name or 'Equipamento' in name:
                mod = 'Simuladores'
            elif 'Agendamento' in name:
                mod = 'Agendamentos'
            elif 'Ficha' in name:
                mod = 'Fichas'
            elif 'Manobra' in name:
                mod = 'Manobras'
            elif 'Funcionário' in name or 'Funcionario' in name:
                mod = 'Funcionarios'
            elif 'Template' in name:
                mod = 'Templates'
            else:
                mod = 'Core'
            
            if mod not in modules:
                modules[mod] = []
            modules[mod].append(data['avg'])
        
        for mod in sorted(modules.keys()):
            times = modules[mod]
            avg = statistics.mean(times)
            
            if avg < 100:
                status = f"{GREEN}EXCELLENT{NC}"
            elif avg < 300:
                status = f"{GREEN}GOOD{NC}"
            elif avg < 500:
                status = f"{YELLOW}OK{NC}"
            else:
                status = f"{RED}SLOW{NC}"
            
            print(f"  {mod:<20} | {avg:>7.1f}ms | {status}")
        
        print()
        
        # Overall rating
        excellent = len(stats_by_category['excellent'])
        good = len(stats_by_category['good'])
        ok = len(stats_by_category['ok'])
        slow = len(stats_by_category['slow'])
        
        if slow == 0 and ok <= 2:
            rating = f"{GREEN}🚀 PRODUCTION READY{NC}"
            grade = "A+"
        elif slow <= 2:
            rating = f"{GREEN}✅ GOOD{NC}"
            grade = "A"
        elif slow <= len(self.results) // 3:
            rating = f"{YELLOW}⚠️  NEEDS OPTIMIZATION{NC}"
            grade = "B"
        else:
            rating = f"{RED}❌ CRITICAL{NC}"
            grade = "F"
        
        print("📈 OVERALL PERFORMANCE RATING")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"Grade: {grade}")
        print(f"Status: {rating}")
        print()
    
    def save_report(self):
        """Save detailed report to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"test-reports/PERFORMANCE_REPORT_{timestamp}.txt"
        
        with open(filename, 'w') as f:
            f.write("AIRTRUST PERFORMANCE TEST REPORT\n")
            f.write(f"Date: {datetime.now().isoformat()}\n")
            f.write("=" * 70 + "\n\n")
            
            f.write("DETAILED METRICS:\n\n")
            for name, data in sorted(self.results.items()):
                f.write(f"{name}:\n")
                f.write(f"  Average Response Time: {data['avg']:.1f} ms\n")
                f.write(f"  Min Response Time: {data['min']:.1f} ms\n")
                f.write(f"  Max Response Time: {data['max']:.1f} ms\n")
                f.write(f"  Cache Hit Rate: {data['cache_rate']:.0f}%\n")
                f.write(f"  HTTP Status: {data['status_code']}\n")
                f.write("\n")
            
            f.write("\nSUMMARY:\n")
            f.write(f"Total Endpoints: {len(self.results)}\n")
            total_cache_hits = sum(data['cache_hits'] for data in self.results.values())
            total_requests = len(self.results) * 3
            f.write(f"Total Requests: {total_requests}\n")
            f.write(f"Cache Hits: {total_cache_hits}\n")
            f.write(f"Cache Hit Rate: {(total_cache_hits/total_requests*100) if total_requests > 0 else 0:.1f}%\n")
        
        print(f"📄 Report saved to: {filename}")

# Main
if __name__ == "__main__":
    tester = PerformanceTester()
    
    # BLOCO 1: CORE
    print(f"\n{BLUE}▶ BLOCO 1: CORE ENDPOINTS{NC}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    tester.add_endpoint("Health Check", "GET", "/health", 200)
    tester.add_endpoint("Funcionarios List", "GET", "/funcionarios?page=1&limit=20", 200)
    tester.add_endpoint("Instrutores", "GET", "/funcionarios/instrutores", 200)
    
    # BLOCO 2: SIMULADORES
    print(f"\n{BLUE}▶ BLOCO 2: SIMULADORES MODULE{NC}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    tester.add_endpoint("Simuladores", "GET", "/simuladores?page=1&limit=20", 200)
    tester.add_endpoint("Agendamentos", "GET", "/agendamentos?page=1&limit=20", 200)
    tester.add_endpoint("Fichas", "GET", "/fichas?page=1&limit=20", 200)
    
    # BLOCO 3: MANOBRAS
    print(f"\n{BLUE}▶ BLOCO 3: MANOBRAS MODULE{NC}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    tester.add_endpoint("Manobras", "GET", "/manobras?page=1&limit=20", 200)
    
    # BLOCO 4: QUALIFICACOES
    print(f"\n{BLUE}▶ BLOCO 4: QUALIFICACOES MODULE{NC}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    tester.add_endpoint("Qualificacoes List", "GET", "/qualificacoes?page=1&limit=20", 200)
    tester.add_endpoint("Qualificacoes Alertas", "GET", "/qualificacoes/alertas-vencimento", 200)
    tester.add_endpoint("Qualificacoes Stats", "GET", "/qualificacoes/dashboard-stats", 200)
    
    # BLOCO 5: HABILITACOES
    print(f"\n{BLUE}▶ BLOCO 5: HABILITACOES MODULE{NC}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    tester.add_endpoint("Habilitacoes List", "GET", "/habilitacoes?page=1&limit=20", 200)
    tester.add_endpoint("Habilitacoes Dashboard", "GET", "/habilitacoes/dashboard", 200)
    tester.add_endpoint("Habilitacoes Alertas", "GET", "/habilitacoes/alertas", 200)
    
    # BLOCO 6: TEMPLATES
    print(f"\n{BLUE}▶ BLOCO 6: TEMPLATES & CONSOLIDADOS{NC}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    tester.add_endpoint("Templates", "GET", "/simuladores-consolidado/templates", 200)
    tester.add_endpoint("Equipamentos", "GET", "/simuladores-consolidado/equipamentos", 200)
    tester.add_endpoint("Manobras Disponiveis", "GET", "/simuladores-consolidado/manobras-disponiveis", 200)
    
    # Run all tests
    tester.run_all()
    
    print(f"\n✅ Performance test complete!")
