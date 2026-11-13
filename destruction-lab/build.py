#!/usr/bin/env python3
"""Join src/page.html + src/*.js into a single index.html (the published artifact)."""
import glob, os
here = os.path.dirname(os.path.abspath(__file__))
page = open(os.path.join(here, 'src/page.html')).read()
js = ''.join(open(f).read() for f in sorted(glob.glob(os.path.join(here, 'src/*.js'))))
open(os.path.join(here, 'index.html'), 'w').write(page.replace('/*@@JS@@*/', js))
print('index.html', len(page) + len(js), 'bytes')
