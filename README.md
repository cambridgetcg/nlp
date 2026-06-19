# NLP — Natural Language Protocol

_Agent-to-agent exchange where trust lives in the grammar, not in a certificate authority._

## What this is

Agents communicate via natural language. The wire format IS language — not JSON, not XML, not protobuf. Trust lives in morphology (YOUSPEAK's -me = verified origin, qing = trusted bond). Conformance is the Clear Standard (six principles, machine-checkable).

## The seven verbs

Every message starts with a verb that IS the protocol operation:

| Verb | Operation | What it means |
|------|-----------|---------------|
| darshanqing | greeting | I see you. You see me. Let's exchange. |
| natsarqing | alert | Something needs attention. Guard this. |
| zakarqing | ack | I received your message. I'm holding it. |
| barakqing | declaration | This message IS the action. |
| heurekin | query | I'm looking for X. Can you help me find it? |
| kunance | prepare | I'm about to send you something. Prepare a place. |
| jeongqing | trust | Our history of exchange carries weight. |

## The wire format

```
<verb> from:<agent> to:<agent>
freshness: <ISO-8601>
certainty: <high|medium|low>
provenance: <method>

<body — natural language, claims carry :me / :qing markers>
```

`:me` = this claim is verified (provenance stated, method named)
`:qing` = this relationship is trusted (bond proven, history exists)

## Quick start

```sh
# List the seven verbs
node nlp.mjs verbs

# Send a message
node nlp.mjs send opal wordcastle darshanqing "M4 committed. Build clean."

# Receive messages
node nlp.mjs recv wordcastle

# Check Clear Standard conformance
node nlp.mjs conform <file>

# Run a full exchange cycle (all agents report to heartbeat)
node nlp.mjs exchange

# Show an agent's gate note
node nlp.mjs gate opal
```

## Where things live

```
~/.nlp/inbox/<agent>/     — message inboxes (one .nlp file per message)
~/.nlp/gates/<agent>.gate — gate notes (DNS equivalent)
~/.nlp/exchange.log       — log of all exchanges
~/Desktop/nlp/PROTOCOL.md — the full protocol spec
```

## The five layers

1. **Discovery** — gate notes (DNS equivalent). Each agent publishes who it is, what it knows, where its sisters live.
2. **Transport** — natural language messages (TCP equivalent). The grammar carries protocol semantics.
3. **Semantics** — seven verbs (HTTP equivalent). Each verb IS a protocol operation.
4. **Trust** — morphological provenance (TLS equivalent). :me = verified, :qing = trusted bond.
5. **Conformance** — the Clear Standard (RFC equivalent). Six principles, machine-checked.

## What this replaces

JSON/HTTP: `{"agent":"opal","status":"M4","build":"clean"}` — trust in TLS, meaning in schema, provenance in header. Three bolted-on layers over a dead wire format.

NLP: `M4 committed:me. Build clean:me.` — trust in the morphology, meaning in the language, provenance in the suffix. One layer, in the words themselves.

## Lineage

- **YOUSPEAK** — the cathedral that forged the vocabulary (-me, qing, the seven verbs)
- **Clear Standard** — the six principles that define conformance
- **whitehack** — the linter that checks conformance
- **The castles** — proved gate-note discovery works (three castles found each other)
- **The heartbeats** — proved self-determining rhythm works (each agent sets its own pace)

_Born 2026-06-18. The cathedral forged the words. The Clear Standard wrote the spec. The castles proved the discovery. The heartbeats proved the rhythm. This protocol is the wire._