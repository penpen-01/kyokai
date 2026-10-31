import json,sys
for f in sys.argv[1:]:
    r=json.load(open(f));g=r['games']
    print(f, 'patched',r.get('patched'),'games',g,'avgTurns',round(r['turns']/g,1),'first%',round(100*r['firstWins']/max(1,g-r['draws'])),'draws',r['draws'],{k:round(100*v['w']/max(1,v['g'])) for k,v in r['deck'].items()})
