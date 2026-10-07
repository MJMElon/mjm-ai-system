"""Strip apostrophes from SQL comments, and from NOTHING else.

The Supabase SQL Editor counts quotes before it parses, so one apostrophe in a
comment opens a string literal that never closes and swallows the rest of the
file. psql strips comments first, so the same file runs perfectly here --
which is why this is only ever found by pasting.

Doing it safely needs a real scan, not a startswith():

  · a line beginning '--' INSIDE a string literal is DATA, and rewriting it
    would change what the file does
  · block comments count too, and an apostrophe in one reads the same way
  · a dollar-quoted body ($$ ... $$) is CODE, with its own comments and its
    own strings, so it is scanned like anything else

So this returns the exact character spans that are comment, and touches only
those. Everything outside them is left byte for byte.
"""
import re, sys, os

SPELL = [("doesn't","does not"),("don't","do not"),("isn't","is not"),
         ("didn't","did not"),("can't","cannot"),("won't","will not"),
         ("wasn't","was not"),("weren't","were not"),("hasn't","has not"),
         ("haven't","have not"),("hadn't","had not"),("it's","it is"),
         ("that's","that is"),("there's","there is"),("what's","what is"),
         ("let's","let us"),("couldn't","could not"),("wouldn't","would not"),
         ("shouldn't","should not"),("aren't","are not"),("you're","you are"),
         ("we're","we are"),("they're","they are")]
# NOT nobody's / somebody's: those are possessive far more often than they are
# "has", and the contraction rule turned "clearing somebody's PIN" into
# "clearing somebody has PIN". The generic possessive below gives "somebodys",
# which is the same compromise the rest of this makes.
DQ = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$")

def spans(text):
    """[(line, start, end)] of every stretch of comment in the file."""
    out = []
    in_str = False; dq = None; blk = False
    for i, line in enumerate(text.split('\n')):
        j = 0; begin = 0 if blk else None
        while j < len(line):
            if blk:
                k = line.find('*/', j)
                if k < 0: j = len(line); break
                out.append((i, begin, k + 2)); blk = False; begin = None; j = k + 2; continue
            if in_str:
                if line[j] == "'":
                    if j + 1 < len(line) and line[j+1] == "'": j += 2; continue
                    in_str = False
                j += 1; continue
            if dq is not None and line.startswith(dq, j):
                j += len(dq); dq = None; continue
            if line.startswith('--', j):
                out.append((i, j, len(line))); j = len(line); break
            if line.startswith('/*', j):
                blk = True; begin = j; j += 2; continue
            if dq is None:
                m = DQ.match(line, j)
                if m: dq = m.group(0); j = m.end(); continue
            if line[j] == "'": in_str = True
            j += 1
        if blk and begin is not None: out.append((i, begin, len(line)))
    return out

def clean(s):
    for a, b in SPELL: s = re.sub(re.escape(a), b, s, flags=re.I)
    s = re.sub(r"(\w)'s\b", r"\1s", s)
    return s.replace("'", "")

files = hits = 0
for path in sorted(sys.argv[1:]):
    text = open(path).read(); L = text.split('\n'); n = 0
    by_line = {}
    for (i, a, b) in spans(text): by_line.setdefault(i, []).append((a, b))
    for i, sp in by_line.items():
        line = L[i]
        for (a, b) in sorted(sp, reverse=True):
            seg = line[a:b]
            if "'" in seg:
                line = line[:a] + clean(seg) + line[b:]; n += 1
        L[i] = line
    if n:
        open(path, 'w').write('\n'.join(L)); files += 1; hits += n
print(f"{files} file(s), {hits} comment span(s) cleaned")
