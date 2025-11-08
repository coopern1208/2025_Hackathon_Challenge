
'''
Tokenize a .qasm
'''

import re
import argparse
import sys
import json

#   remove comments regex
RE_LINE_COMMENT  = re.compile(r"//.*?$", re.MULTILINE)
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)

# tokenize regex
TOKEN_RE = re.compile(
    r"""
    (?P<ID>        [A-Za-z_][A-Za-z0-9_]*)
  | (?P<NUMBER>    (?:\d+\.\d*|\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)
  | (?P<STRING>    "([^"\\]|\\.)*")
  | (?P<ARROW>     ->)
  | (?P<OP>        ==|!=|<=|>=|\+=|-=|\*=|/=|&&|\|\||::)
  | (?P<SYMBOL>    [{}\[\]();,.:<>+\-*/%&|^~?=])
    """,
    re.VERBOSE,
)

# friendly type names
TYPE_MAP = {
    "ID": "identifier",
    "NUMBER": "number",
    "STRING": "string",
    "ARROW": "arrow",
    "OP": "operator",
    "SYMBOL": "symbol",
}

def strip_comments(src):
    src = RE_BLOCK_COMMENT.sub("", src)
    src = RE_LINE_COMMENT.sub("", src)
    return src

def tokenize(src):
    #   return dict tokens: {'typ','val'}
    i = 0
    n = len(src)
    while i < n:
        m = TOKEN_RE.match(src, i)
        if m:
            raw_typ = m.lastgroup
            val = m.group(raw_typ)
            typ = TYPE_MAP.get(raw_typ, raw_typ.lower())
            yield {"typ": typ, "val": val}
            i = m.end()
            continue

        ch = src[i]
        if ch.isspace():
            i += 1
            continue

        snippet = src[i:i+20].replace("\n", "\\n")
        raise SyntaxError("Unexpected character {!r} at {}:{} near '{}'".format(ch, snippet))

def main(argv=None):
    parser = argparse.ArgumentParser(description="Tokenize a .qasm file and emit JSON.")
    parser.add_argument("path", nargs="?", default="-",
                        help="Path to .qasm file, or '-' to read from stdin.")
    parser.add_argument("--ndjson", action="store_true",
                        help="Output newline-delimited JSON (one token per line).")
    parser.add_argument("--include", nargs="*", choices=sorted(set(TYPE_MAP.values())),
                        help="Only include these token types (e.g. identifier number string).")
    args = parser.parse_args(argv)

    # read input
    if args.path == "-":
        src = sys.stdin.read()
    else:
        with open(args.path, "r", encoding="utf-8") as f:
            src = f.read()

    cleaned = strip_comments(src)

    try:
        tokens = list(tokenize(cleaned))
    except SyntaxError as e:
        print("error: {}".format(e), file=sys.stderr)
        return 1

    # emit json
    if args.ndjson:
        for t in tokens:
            print(json.dumps(t, ensure_ascii=False))
    else:
        print(json.dumps(tokens, ensure_ascii=False, indent=2))

    return 0

if __name__ == "__main__":
    sys.exit(main())
