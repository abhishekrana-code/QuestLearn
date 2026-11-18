#!/bin/sh
# Refuses to let credentials reach this public repository.
#
# Two kinds of check:
#   * a path that must never be tracked: .env and its variants, private key
#     material, npm and PostgreSQL credential files;
#   * a string shaped like a live credential: provider API keys, private key
#     blocks, and a PostgreSQL URL that carries a password.
#
# Matches are reported by rule, file and line only. The value itself is never
# printed: this output ends up in terminal transcripts and CI logs, and a
# scanner that echoes the secret makes the leak worse.
#
#   sh scripts/secret-scan.sh --staged      what the next commit would add
#   sh scripts/secret-scan.sh --tree        every tracked file in the worktree
#   sh scripts/secret-scan.sh --history     every commit reachable from a ref
#   sh scripts/secret-scan.sh --range REV   every commit in REV, e.g. origin/master..HEAD
#
# The flags combine, so CI runs one command for the tree and the history.
# Exit status is 0 when clean, 1 on findings, 2 when the check could not run.
#
# Install the hook once per clone:
#   git config core.hooksPath .githooks
# Git's own bypass still applies: git commit --no-verify.
#
# A deliberate false positive is silenced with secret-scan:allow on the same
# line, or by tightening the rule below. Prefer the marker: a placeholder in a
# document is not a reason to weaken the rule that catches the real key.

set -u

usage() {
    cat >&2 <<'USAGE'
usage: sh scripts/secret-scan.sh [--staged] [--tree] [--history] [--range REV]

  --staged     scan what the next commit would add (used by .githooks/pre-commit)
  --tree       scan every tracked file in the working tree
  --history    scan every commit reachable from any ref
  --range REV  scan the commits in REV, such as origin/master..HEAD

No flag means --staged.
USAGE
}

want_staged=0
want_tree=0
want_history=0
range=

while [ $# -gt 0 ]; do
    case "$1" in
        --staged) want_staged=1; shift ;;
        --tree) want_tree=1; shift ;;
        --history) want_history=1; shift ;;
        --range)
            [ $# -ge 2 ] || { usage; exit 2; }
            want_history=1
            range=$2
            shift 2
            ;;
        -h|--help) usage; exit 0 ;;
        *) echo "secret-scan: unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

if [ "$want_staged" -eq 0 ] && [ "$want_tree" -eq 0 ] && [ "$want_history" -eq 0 ]; then
    want_staged=1
fi

if ! root=$(git rev-parse --show-toplevel 2>/dev/null); then
    echo "secret-scan: not inside a git working tree" >&2
    exit 2
fi
cd "$root" || exit 2

tmpdir=${TMPDIR:-/tmp}
findings=$(mktemp "$tmpdir/questlearn-secret-findings.XXXXXX") || exit 2
list=$(mktemp "$tmpdir/questlearn-secret-list.XXXXXX") || exit 2
stream=$(mktemp "$tmpdir/questlearn-secret-stream.XXXXXX") || exit 2
rules_file=$(mktemp "$tmpdir/questlearn-secret-rules.XXXXXX") || exit 2
trap 'rm -f "$findings" "$list" "$stream" "$stream.labeled" "$rules_file"' EXIT
tab=$(printf '\t')

# rule@@extended-regular-expression. The separator is not "|", because every
# provider pattern here uses alternation.
rules() {
    cat <<'RULES'
private-key@@-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----
aws-access-key@@(AKIA|ASIA)[0-9A-Z]{16}
github-token@@gh[pousr]_[A-Za-z0-9]{36,}
github-pat@@github_pat_[A-Za-z0-9_]{50,}
gitlab-token@@glpat-[A-Za-z0-9_-]{20,}
npm-token@@npm_[A-Za-z0-9]{36}
slack-token@@xox[abposr]-[A-Za-z0-9-]{10,}
stripe-live-key@@(sk|rk)_live_[A-Za-z0-9]{20,}
sendgrid-key@@SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}
google-api-key@@AIza[0-9A-Za-z_-]{35}
groq-api-key@@gsk_[A-Za-z0-9]{40,}
resend-api-key@@re_[A-Za-z0-9]{24,}
openai-key@@sk-(proj-)?[A-Za-z0-9_-]{32,}
anthropic-key@@sk-ant-[A-Za-z0-9_-]{20,}
tailscale-key@@tskey-[a-z]+-[A-Za-z0-9]{10,}
postgres-url@@postgres(ql)?://[^:/@[:space:]"']+:[^@[:space:]"']+@
RULES
}

report() { # rule, where, path
    printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$findings"
}

# Paths that must never be tracked, whatever they contain.
check_path() { # path, where
    path=$1
    base=${path##*/}
    case "$base" in
        .env|.env.*|*.env)
            case "$base" in
                *.example|*.sample|*.template) return 0 ;;
            esac
            report "environment file" "$2" "$path"
            ;;
        *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.ppk|*.p8|id_rsa|id_dsa|id_ecdsa|id_ed25519)
            report "private key material" "$2" "$path"
            ;;
        .npmrc|.pgpass|.netrc|credentials.json)
            report "credential file" "$2" "$path"
            ;;
    esac
}

scan_index_or_worktree() { # cached(yes/no), where
    cached=$1
    where=$2

    if [ "$cached" = yes ]; then
        git diff --cached --name-only --diff-filter=ACMR -z > "$list" || exit 2
        label="$where"
    else
        git ls-files -z > "$list" || exit 2
        label="$where"
    fi

    [ -s "$list" ] || return 0

    tr '\0' '\n' < "$list" | while IFS= read -r path; do
        [ -n "$path" ] && check_path "$path" "$label"
    done

    while IFS= read -r rule; do
        name=${rule%%@@*}
        re=${rule#*@@}
        if [ "$cached" = yes ]; then
            xargs -0 git grep --cached -nE -e "$re" -- < "$list" 2>/dev/null
        else
            xargs -0 git grep -nE -e "$re" -- < "$list" 2>/dev/null
        fi |
            grep -v 'secret-scan:allow' |
            while IFS=: read -r path line _; do
                [ -n "$path" ] && report "$name" "line $line" "$path"
            done
    done < "$rules_file"
}

scan_history() {
    if [ -n "$range" ]; then
        git log --pretty=format: --name-only --diff-filter=ACMR "$range" || exit 2
    else
        git log --pretty=format: --name-only --diff-filter=ACMR --all || exit 2
    fi | sort -u | while IFS= read -r path; do
        [ -n "$path" ] && check_path "$path" "in history"
    done

    if [ -n "$range" ]; then
        git log -p --no-color --reverse --pretty=format:'@@@ %h' "$range" > "$stream" || exit 2
    else
        git log -p --no-color --reverse --all --pretty=format:'@@@ %h' > "$stream" || exit 2
    fi

    # Label every patch line with the commit and the file it belongs to, so a
    # finding points at a commit instead of "somewhere in the history".
    awk '
        /^@@@ / { commit = substr($0, 5); minus = ""; plus = ""; next }
        /^diff --git / { minus = ""; plus = ""; next }
        /^--- / { minus = substr($0, 5); sub(/^a\//, "", minus); next }
        /^\+\+\+ / { plus = substr($0, 5); sub(/^b\//, "", plus); next }
        {
            path = (plus == "" || plus == "/dev/null") ? minus : plus
            if (path == "" || path == "/dev/null") next
            print commit "\t" path "\t" $0
        }
    ' "$stream" > "$stream.labeled" || exit 2

    while IFS= read -r rule; do
        name=${rule%%@@*}
        re=${rule#*@@}
        grep -E -e "$re" "$stream.labeled" 2>/dev/null |
            grep -v 'secret-scan:allow' |
            cut -f1,2 |
            sort -u |
            while IFS="$tab" read -r commit path; do
                [ -n "$path" ] && report "$name" "commit $commit" "$path"
            done
    done < "$rules_file"

    rm -f "$stream.labeled"
}

rules > "$rules_file"

if [ "$want_staged" -eq 1 ]; then
    scan_index_or_worktree yes "in the staged changes"
fi

if [ "$want_tree" -eq 1 ]; then
    scan_index_or_worktree no "in the working tree"
fi

if [ "$want_history" -eq 1 ]; then
    scan_history
fi

if [ -s "$findings" ]; then
    count=$(sort -u "$findings" | wc -l | tr -d ' ')
    sort -u "$findings" | head -60 |
        while IFS="$tab" read -r rule where path; do
            printf 'secret-scan: %s in %s (%s)\n' "$rule" "$path" "$where"
        done
    echo
    printf 'secret-scan: %s finding(s).\n' "$count"
    if [ "$count" -gt 60 ]; then
        echo "secret-scan: only the first 60 are shown."
    fi
    cat <<'HINT'
secret-scan: keep values in a gitignored .env file, then rotate anything that
was already committed. Removing a commit is not enough once it has been pushed.
HINT
    exit 1
fi

echo "secret-scan: nothing found."
