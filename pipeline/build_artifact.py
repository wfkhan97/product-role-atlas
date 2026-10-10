"""Produce web/artifact.html: the page without <html>/<head>/<body> wrappers, CSS and JS inlined,
data still loaded from data/*.json (published as supporting files)."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(ROOT, "web")
html = open(os.path.join(W, "index.html")).read()
css = open(os.path.join(W, "style.css")).read()
js = open(os.path.join(W, "match.js")).read() + "\n" + open(os.path.join(W, "app.js")).read()
title = re.search(r"<title>(.*?)</title>", html).group(1)
fonts = re.search(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>', html).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="match.js"></script>\n', "").replace('<script src="app.js"></script>', "<script>\n" + js + "\n</script>")
out = f"<title>{title}</title>\n{fonts}\n<style>\n{css}\n</style>\n{body}"
open(os.path.join(W, "artifact.html"), "w").write(out)
print("artifact.html", len(out), "bytes")
