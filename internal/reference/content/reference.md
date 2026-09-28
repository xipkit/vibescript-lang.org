Vibescript runs scripts inside your Go app. Your app supplies the data and
functions each script can use, and sets its execution limits. For the Go API,
adapters that connect scripts to your app, and migration notes, see the
[upstream docs](https://github.com/xipkit/vibescript/tree/master/docs).

Scripts call named functions and methods, work with arrays and hashes, and
use services your app provides. Blocks run during the call that receives them.
Modules group functions and constants. Your Go app handles concurrency,
scheduling, and I/O.

## Basics {#basics}

### Source structure {#source-structure}

Vibescript files are UTF-8 text and usually use a `.vibe` extension. A `#`
starts a comment that continues to the end of the line.

A file can declare functions, classes, modules, and enums. Statements at the
top level become the default script body when the file runs directly. When
`require` loads the file, those statements become the module initializer. An
app that embeds Vibescript will usually call a named function instead. The
runnable examples on this site work that way.

Use newlines or semicolons to separate statements. An expression can also be a
statement.

### Values & literals {#literals}

```vibe
missing = nil
active = true
count = 42
price = 19.99
label = :active
greeting = "hello #{name}"
tags = ["alpha", "beta"]
config = {retries: 3, verbose: true}
window = 1..5
grace = 2.days
```

The literal categories are `nil`, `true`, `false`; integers and floats;
strings; symbols (`:name`, or quoted as `:"with-punctuation"`); arrays;
hashes; ranges; and duration literals such as `5.minutes` or `2.days`.

`..` includes the final value, while `...` leaves it out. Open-ended ranges
work too: `arr[1..]` takes everything from index 1 on, `s[..2]` takes the first
characters, and `when 3..` matches three and up.

You cannot iterate an open range. `each`, `map`, `to_a`, `for`, and similar
operations return an error before they run. Unlike Ruby, a descending range
does iterate: `(5..1).to_a` returns `[5, 4, 3, 2, 1]` instead of an empty
array.

### Numbers {#numbers}

Vibescript has one integer type: `int`. It keeps exact values when arithmetic
goes past the signed 64-bit range, and uses the smaller representation again
when the value fits. Scripts never see a separate "bignum" type.

Some APIs still require a value that fits in 64 bits and return an error for a
larger value. These include range endpoints, iteration counts (`times`,
`upto`, `downto`, `step`), `Money`/`Duration`/`Time` arithmetic, and arguments
used as indexes, counts, sizes, or precision values.

```vibe
big = 2 ** 100          # => 1267650600228229401496703205376, exact
readable = 1_000_000    # underscores are visual separators
hex = 0xDEAD_BEEF       # 0x, 0b, 0o, and 0d base prefixes
sci = 1.5e-2            # floats may use scientific notation
kilo = 1e3              # any literal with an exponent is a float: 1000.0
```

Numeric literals can use underscores between digits in any base. An exponent
(`e` or `E`) can include a sign and must include at least one digit. An
exponent that is too large for a 64-bit float becomes `Infinity`.

A number cannot touch an identifier. `123abc` and `1.5x` are parse errors, not
two tokens. A leading zero does not make a number octal, so `010` is decimal.

### Strings & symbols {#strings}

Double-quoted strings support `#{...}` interpolation. Vibescript evaluates the
expression and converts its value with `to_s`. The expression can contain its
own double-quoted strings and nested interpolation, and ends at the matching
`}`. Escape a literal marker as `\#{...}`. Single-quoted strings do not
interpolate.

```vibe
def describe(name)
  "#{name || "guest"} checked in"
end
```

Symbols are usually written bare (`:name`), but a quoted form lets a symbol
hold punctuation, spaces, or be empty: `:"foo-bar"`, `:'foo bar'`, `:""`.
Quoted symbols use the same escapes as the matching string quote, and
interpolation is not supported in symbol literals.

Hash keys live in one string keyspace. A bare label and a quoted label both
make a string key, so `{ name: 1 }` and `{ "name": 1 }` are the same hash.
Either `h[:name]` or `h["name"]` reads that entry, and `h.keys` returns strings.
A symbol remains a distinct value everywhere else. Ruby's hash rocket syntax
(`=>`) is not supported.

Strings are immutable values. Reading with `[]` mirrors Ruby's `String#[]`
and `Array#[]`, including negative indexes, `value[start, length]`, and
`value[range]` slices.

### Variables & assignment {#variables}

Assignment creates variables. Parallel and destructuring assignment split an
array across several targets:

```vibe
a, b = [1, 2]
first, *middle, last = [1, 2, 3, 4]
x, (y, z) = [1, [2, 3]]
```

Missing values bind as `nil`, extra values are ignored unless captured by a
`*rest` target, and scalar right-hand values are treated as one value. A bare
`*` is an anonymous rest target that discards what it captures. It can sit
at the front, middle, or end (`*, last = [1, 2, 3]`).

Index assignment updates the array or hash named by its target. Collections
have value semantics: binding or passing one creates another logical value, so
an update through one binding does not change an alias. Array targets accept a
negative index that counts back from the end:

```vibe
items = [1, 2, 3]
original = items
items[0] = 10
items[-1] = 30

items    # => [10, 2, 30]
original # => [1, 2, 3]
```

Compound assignment is supported for variables, member targets, and index
targets with `+=`, `-=`, `*=`, `/=`, `%=`, and `**=`:

```vibe
total += amount
items[0] *= 2
record[:score] **= 2
```

## Functions {#functions}

### Defining functions {#defining-functions}

Define functions with `def`/`end`. The last evaluated expression is the
return value, and `return` exits early:

```vibe
def add(a, b)
  a + b
end
```

Type annotations on parameters and return values are optional. When present,
Vibescript checks them at runtime when the function is called and returns:

```vibe
def charge(amount: int, currency: string = "USD") -> hash
  {amount: amount, currency: currency}
end
```

### Parameter forms {#parameters}

A parameter's syntax controls how it receives a value. The token after `:`
separates keyword parameters from typed parameters:

| Form | Meaning |
| --- | --- |
| `name` | required positional parameter |
| `name = default` | optional positional parameter |
| `name: Type` | typed positional parameter |
| `name: Type = default` | typed positional parameter with a default |
| `name:` | required keyword-only parameter |
| `name: default` | optional keyword-only parameter |
| `*rest` | captures extra positional arguments |
| `**rest` | captures extra keyword arguments |

A keyword-only parameter only accepts its matching label, not a positional
argument. An optional keyword uses its default when the label is missing. A
later default can use an earlier parameter:

```vibe
def connect(host:, port: 8080, scheme: "https", timeout: port * 2)
  "#{scheme}://#{host}:#{port}"
end

def demo
  connect(host: "example.com")            # port 8080, scheme "https"
  connect(host: "example.com", port: 443) # overrides port
end
```

`name: Type` declares a typed positional parameter, so a bare name after `:`
is read as a type. Write `a: int` for a typed positional parameter and `a: 0`
for an optional keyword. If a default is only a reference to an earlier
parameter, put it in parentheses. `timeout: port * 2` is a default, but
`timeout: port` looks like a type. Write `timeout: (port)` instead.

### Functions stay named {#named-functions}

Call a function or method where it is named. Executable code cannot be stored
as a value: a bare function reference is an error, there is no callable
`.call`, and methods cannot be detached. Pass short-lived behavior with a block
instead; the receiving call runs it synchronously with `yield`.

## Calls & Blocks {#calls}

### Method calls {#method-calls}

Calls accept positional and keyword arguments. You can leave out parentheses
when all arguments are on one line:

```vibe
def demo(fees, amount)
  fees.apply(amount)
  fees.apply amount
  render status: "ok"
end
```

Positional arguments must come before keyword labels: `collect(first: 1,
"tail")` is a parse error, while `collect("head", first: 1)` is accepted.

A label becomes a keyword argument when the function accepts that keyword. If
the function expects a positional hash instead, the labels become its final
options hash. This works with or without parentheses:

```vibe
def configure(opts)
  opts[:retries]
end

def demo
  configure(retries: 3)  # => 3
  configure retries: 3   # same call
end
```

Constructors (`Klass.new(...)`) and methods (`receiver.method(...)`) use
stricter rules. Inside parentheses, a keyword without a matching parameter
does not become a positional options hash.

A local variable already holding the value of a keyword can be passed with
the shorthand `greet(name:)`, which is `greet(name: name)`.

### Splats & parenless arguments {#splats}

Ruby-style splats expand saved arguments. `f(*args)` turns an array into
positional arguments. `f(**opts)` turns a hash into keyword arguments; keys
can be strings or symbols, and the last duplicate wins. You can combine both
forms with regular arguments and blocks:

```vibe
def sum3(a, b, c)
  a + b + c
end

def demo
  args = [2, 3]
  sum3(1, *args) # => 6
end
```

Vibescript expands splats before it binds parameters. Errors about argument
count, keywords, and types are therefore the same as they would be for a call
written out in full.

Spacing decides how a call without parentheses is read. `f *args` uses a
splat, while `a * b` and `a*b` multiply. The same rule allows a regex or array
literal as an argument (`match /ID-[0-9]+/`, `puts [3, 1, 2].sort`).

In a call to a non-local function, an operator-like symbol starts an argument
when it is separated from the function name but touches its value. With any
other spacing, Vibescript reads it as an operator.

### Blocks {#blocks}

Blocks are synchronous code attached to a call with `do ... end` or braces.
They run before that receiving call returns and cannot be stored, returned, or
forwarded. Missing block arguments become `nil`. Block parameters can also
unpack a yielded value in the same way as destructuring assignment:

```vibe
def active_names(players)
  players
    .select do |player|
      player[:active]
    end
    .map do |player|
      player[:name]
    end
end

def firsts(rows)
  rows.map do |(head, *)|
    head
  end
end
```

A function runs its caller's block with `yield`, and `block_given?` reports
whether the current call was given one:

```vibe
def fetch(default)
  if block_given?
    yield
  else
    default
  end
end

def demo
  fetch("none")             # => "none"
  fetch("none") { "value" } # => "value"
end
```

As in Ruby, `return` inside a block returns from the method that created the
block and stops iteration. Any `ensure` block still runs. A block with no
parameter list can use the implicit parameters `it` and `_1` through `_9`.

### Safe navigation {#safe-navigation}

`receiver&.member` reads a member or calls a method only when the receiver is
not `nil`. If it is `nil`, the access returns `nil` without evaluating its
arguments or block:

```vibe
def demo(user)
  user&.name
  user&.profile("public")
  user&.profile&.name
end
```

The operator only guards the next access. In `user&.profile.name`, `.name`
still runs on the value returned by `user&.profile`. Guard each link that may
be `nil`. Safe navigation cannot be an assignment target, so
`user&.name = "Ada"` is a parse error.

## Operators {#operators}

### Operator families {#operator-families}

- Arithmetic: `+`, `-`, `*`, `/`, `%`, `**`
- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`, `<=>`
- Case equality: `===`
- Regex match: `text =~ /re/` (character index of the first match, or `nil`)
  and `text !~ /re/` (`true` when the pattern does not match)
- Boolean: `&&`, `||`, unary `!`
- Collection: `array << value` (append), `array & other` (intersection)
- Unary sign: prefix `-` negates a number; prefix `+` is the identity on
  numbers and strings
- Conditional: `condition ? when_true : when_false`

The Ruby word forms `and`, `or`, and `not` are **not** boolean operators in
Vibescript. They are ordinary identifiers, so they can be used as method
names, function names, and hash labels. Use `&&`, `||`, and `!`.

`array << value` appends and returns the receiver. A bare `values << item`
statement updates the local it names. Arrays are values, so aliases remain
unchanged. `array & other` returns a new array holding the elements common to
both, duplicates removed, left order preserved. Following Ruby, `+` binds
tighter than `<<`, which binds tighter than `&`.

### Comparison & case equality {#comparison}

The spaceship operator `<=>` returns `-1`, `0`, or `1` when it can order two
values. It returns `nil` for values it cannot order, such as different kinds,
money in different currencies, or a comparison with `NaN`. The operators
`<`, `<=`, `>`, and `>=` raise an `ArgumentError` for the same values.

`===` uses its left value as a matcher, just like `case` and `when`. A range
checks membership, a regex tests a string, and every other value uses `==`:

```vibe
def demo
  (1..3) === 2       # => true
  /el+/ === "hello"  # => true
  1 === 1.0          # => false; int and float stay distinct kinds
end
```

### Precedence & continuation {#precedence}

Operators follow the usual arithmetic and boolean order. `**` groups from the
right and binds more tightly than unary `-`, so `-2 ** 2` means `-(2 ** 2)`.
An integer raised to a non-negative integer power stays an `int`, even past 64
bits. Mixed number types and negative integer exponents return a `float`.

Division follows Ruby: integer division by zero (`1 / 0`) raises, while
float division by zero (`1.0 / 0`) follows IEEE 754 and yields `Infinity`,
`-Infinity`, or `NaN`; inspect those with `Float#nan?`, `Float#infinite?`,
and `Float#finite?`. `&&` binds tighter than `||`, and ternary conditionals
sit below `||`, associate to the right, and evaluate only the selected
branch.

Vibescript reads a leading `+` or `-` differently from Ruby. When the operator
touches its value, it starts a new statement. When a space follows the
operator, it continues the previous line. This lets you indent multi-line
arithmetic under its first value:

```vibe
def demo(total, amount)
  total
    + amount
end
```

## Control Flow {#control-flow}

### Conditionals {#conditionals}

`if` / `elsif` / `else` and `unless` / `else` can be statements or return
values. If no branch matches and there is no `else`, they return `nil`:

```vibe
def label(score)
  if score >= 90
    "great"
  elsif score >= 80
    "passing"
  else
    "retry"
  end
end
```

Short statements can use modifier conditionals and ternaries:

```vibe
def demo(active, suspended)
  status = "open" unless suspended
  active ? "active" : "inactive"
end
```

### case / when {#case-when}

`case` returns the value of the matching branch. It returns `nil` if nothing
matches and there is no `else`. Each `when` uses `===`: ranges check
membership, regexes test strings, and other values use equality. Use `then`
for a one-line branch:

```vibe
def label(score)
  case score
  when 100 then "perfect"
  when 90, 95 then "great"
  when 80..99 then "passing"
  else "ok"
  end
end
```

Targetless `case` evaluates each `when` expression as a predicate in order:

```vibe
def bucket(score)
  case
  when score == 100 then "perfect"
  when score >= 80 then "passing"
  else "ok"
  end
end
```

### Loops {#loops}

`while` and `until` repeat while testing a condition. `for ... in` loops over
arrays, ranges, and hashes. An optional `do` can separate the condition or
collection from the loop body:

```vibe
def countdown(n)
  out = []
  while n > 0 do
    out << n
    n -= 1
  end
  out
end

def sum_first_five
  total = 0
  for n in 1..5
    total += n
  end
  total
end
```

A `for` loop over a hash gets one `[key, value]` pair at a time in insertion
order. `break` and `next` affect the closest active loop. They return an error
outside a loop and cannot cross a function call. Short loops can also use the
modifier form:

```vibe
def demo(i)
  i += 1 while i < 3
  i -= 1 until i <= 0
  i
end
```

Every loop iteration uses part of the sandbox's step limit. An infinite loop
therefore stops with an error instead of hanging the Go app.

### Error handling {#errors}

Use `raise` to report an error and `begin` / `rescue` / `ensure` to handle it.
A `rescue` clause can save the error and read its message:

```vibe
def safe_divide(a, b)
  begin
    a / b
  rescue RuntimeError => err
    "failed: #{err.message}"
  ensure
    cleanup
  end
end
```

### Guard clauses {#guards}

`return` works with modifier conditionals for early exits:

```vibe
def ship(order)
  return "missing" unless order
  return "empty" if order[:items] == []
  "shipped"
end
```

## Types & Structure {#types}

### Classes {#classes}

Classes hold state and methods. Create an instance with `.new`. Methods use
the same parameter and return syntax as functions:

```vibe
class Counter
  def bump(value: int) -> int
    value + 1
  end
end

def demo
  Counter.new.bump(1) # => 2
end
```

Inheritance is not supported. Instance variables (`@name`), class variables
(`@@count`), accessors, class methods, and visibility are covered in the upstream
[classes guide](https://github.com/xipkit/vibescript/blob/master/docs/classes.md).

### Modules {#modules}

Modules put functions and constants under one name. They are explicit
namespaces, not sources of methods for other types. A module can hold
`def self.` functions, constants, and nested modules:

```vibe
module Billing
  LIMIT = 5

  def self.code
    "ok"
  end
end

def demo
  Billing.code   # => "ok"
  Billing::LIMIT # => 5
end
```

`module` is only treated as a keyword when a constant name follows it. Modules
can be nested (`Outer::Inner`), but they cannot be instantiated.

There is no `include` or `extend`. Call module functions through their module
name, as shown above.

Load shared code from another file with `require`. A file module is separate
from a `module` declared in source. The Go app controls where `require` can
look with `Config.ModulePaths` and its allow and deny lists:

```vibe
def demo(input)
  require("public/helpers", as: "helpers")
  helpers.normalize(input)
end
```

### Enums {#enums}

Enums define a fixed set of named values. Access a value with `::`:

```vibe
enum Status
  Draft
  Published
end

def demo
  Status::Draft
end
```

Conversion, equality, and serialization behavior are covered in the upstream
[enums guide](https://github.com/xipkit/vibescript/blob/master/docs/enums.md).

### Gradual typing {#typing}

Types are optional. Add them to parameters and return values where they help.
Vibescript checks them when a typed function receives or returns a value.
Before a script runs, the checker also tracks local types and reports known
conflicts. Values without annotations stay dynamic.

Type names are case-insensitive: `int`, `float`, `number`, `string`, `bool`,
`nil`, `duration`, `time`, `money`, `array`, `hash`/`object`, `range`,
top-level enum names, and `any`. Append `?` for nullable
(`string?`, `int?`), join alternatives with `|` (`int | string`), and
parameterize containers with `array<T>` and `hash<K, V>`.

Shape types list the fields in a hash. Add `?` to an optional field name. Add
`...` at the end to allow other keys:

```vibe
def apply_bonus(payload: { id: string, points: int }) -> { id: string, points: int }
  { id: payload[:id], points: payload[:points] + 5 }
end

def register(user: { name: string, age?: int, ... }) -> string
  user[:name]
end
```

## Runtime {#runtime}

### Built-ins {#builtins}

Vibescript includes assertions, conversion helpers, `Time`, `Duration`, and
`Money` values, plus `JSON` and `Regex` helpers. The sandbox counts the work
done by their operations. Create durations from integers:

```vibe
def demo
  5.minutes
  2.days
end
```

The upstream [built-ins guide](https://github.com/xipkit/vibescript/blob/master/docs/builtins.md)
and [standard library guide](https://github.com/xipkit/vibescript/blob/master/docs/stdlib_core_utilities.md)
list every method, including methods on strings, arrays, hashes, and ranges.

### Add SMS and email {#app-services}

Your app can give scripts services such as SMS, email, or a job queue through
**capabilities**. You choose the names and methods. For example, an adapter can
expose `sms.send(phone, body)` or `email.send(address, subject, body)`.

The [SMS example](/examples/showcase-notifications-sms) and
[email example](/examples/showcase-notifications-email) include the Go adapters
that run them. Both return message previews. They don't send anything.

Each adapter implements `Bind`, which returns the names a script can use.
`NewTypedBuiltin` checks the arguments and return type. Pass the adapter in
`CallOptions.Capabilities` when you call the script:

```go
result, err := script.Call(ctx, "run", nil, vibes.CallOptions{
    Capabilities: []vibes.CapabilityAdapter{
        notifications.SMS{},
        notifications.Email{},
    },
})
if err != nil {
    return err
}
```

Here, `notifications` is your Go package containing the adapters shown in the
examples. Pass only the capabilities that a particular script needs. The
adapter's Go code decides who can receive a message and which provider to use.
Keep provider credentials in Go, and pass `binding.Context` to the provider's
client so it can honor cancellation and deadlines.

### Host-owned scheduling {#host-scheduling}

One `Script.Call` is the unit the Go app schedules and budgets. Scripts do not
create child executions or request idle delays. When work should happen in
parallel, the host can run independent calls concurrently or expose a bounded
batch capability. Delayed work belongs in the host's timer or job system.

### Sandbox & quotas {#sandbox}

Every run has three limits: **steps**, **memory**, and **recursion depth**. Loop
iterations, including empty ones, use steps. Calls and allocations also count
toward a limit. Arguments expanded from a splat cost the same as arguments
written out in full.

When a script reaches a limit, it stops and returns a clear error:
`step quota exceeded`, `memory quota exceeded`, or
`recursion depth exceeded`. The Go app keeps running.

Recursion can never be unlimited because the interpreter uses the Go stack.
Even the largest profile keeps a finite limit, so runaway recursion returns an
error instead of crashing the process.

Scripts cannot access the filesystem, network, or clock on their own. The Go
app can pass in data and typed **capability adapters**. These adapters check
arguments and results. Values that cross this boundary must contain data only;
executable code cannot cross it.

With `StrictEffects` enabled, globals must also contain data only. Every side
effect must then go through a capability adapter. Cancelling the Go context
also cancels the script.

Every example on this site uses a small set of limits. The homepage shows the
exact values.

### Host configuration {#host-config}

Create an engine with `vibes.Config`. Its zero value gives you a working
sandbox with safe limits:

```go
engine, err := vibes.NewEngine(vibes.Config{
    StepQuota:        20_000,
    MemoryQuotaBytes: 256 << 10, // 256 KiB
    RecursionLimit:   32,
    StrictEffects:    true,
    ModulePaths:      []string{"/srv/vibes/modules"},
})
```

| Field | Default | Controls |
| --- | --- | --- |
| `StepQuota` | 1,000,000 | steps per call; loops, calls, and allocations use it |
| `MemoryQuotaBytes` | 16 MiB | live interpreter memory per call |
| `RecursionLimit` | 256 | call depth; this limit is always finite |
| `StrictEffects` | `false` | whether globals must contain data only; side effects use capability adapters |
| `ModulePaths` | none | directories where `require` looks for modules |
| `ModuleAllowList` / `ModuleDenyList` | none | which modules may load |
| `OutputWriter` / `ErrorWriter` | unset | where `puts`/`print`/`p` and `warn` write; without a writer, they raise an error |
| `RandomReader` / `RandomReadFunc` | `crypto/rand` | source of random data for scripts |
| `MaxSourceBytes` | 1 MiB | largest source file one compile accepts |
| `MaxCachedModules` | 1,000 | largest number of compiled modules kept in the cache |
| `DevMode` | `false` | reload modules when their files change during development |

A zero quota means "use the default." Set a quota to `vibes.Unlimited` to turn
it off. You can also use a named profile instead of setting each quota. From
smallest to largest:

| Profile | Steps | Memory | Recursion |
| --- | --- | --- | --- |
| `low` | 1,000,000 | 16 MiB | 256 |
| `medium` | 20,000,000 | 128 MiB | 1,000 |
| `high` | 200,000,000 | 512 MiB | 4,000 |
| `xhigh` | unlimited | unlimited | 10,000 |

`vibes.ProfileHigh.ApplyTo(&cfg)` changes only the three quota fields.
`vibes.QuotaProfileByName("medium")` finds a profile by name. The `vibes` CLI
uses the same profiles and defaults to `xhigh` because it runs your own scripts,
not untrusted code. The upstream guides cover capability adapters, module
rules, and per-call options (`CallOptions.Globals`,
`CallOptions.Capabilities`):
[integration guide](https://github.com/xipkit/vibescript/blob/master/docs/integration.md)
and
[host cookbook](https://github.com/xipkit/vibescript/blob/master/docs/host_cookbook.md).
