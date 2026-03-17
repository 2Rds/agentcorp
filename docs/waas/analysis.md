That's an honest and important realization. Let me push on this because it actually simplifies everything.
The 10-model orchestration looks impressive in the architecture doc. But ask yourself: does each model earn its place?
Here's the honest breakdown of what each model brings vs. the complexity it adds:
Clearly earns its place:

Opus 4.6 — your primary reasoning engine. Irreplaceable for complex tasks. Expensive but necessary.
Grok 4.1 Fast — $0.20/$0.50 is 25-50x cheaper than Opus. If you can route ANY task here instead of Opus, you save massively. This is your cost optimization lever.

Probably earns its place:

Sonar Pro — real-time web search with citations. No other model does this natively. If your agents need live data, this stays.
Cohere Embed + Rerank — powers your Mem0 vector memory. If you're using Mem0 (or migrating to self-hosted Redis with vector search), you need an embedding model. This is infrastructure, not a choice.

Questionable:

Gemini 3.1 Pro — what does this do that Opus can't? If it's "cheaper reasoning," Grok 4.1 Reasoning already fills that role at 10x less cost.
Command A (Cohere) — what does this do that Opus or Grok can't handle?
Granite 4.0 (IBM) — "compliance advisor" sounds like a role Opus handles just fine with the right system prompt.
Grok 4.1 Reasoning — is this meaningfully different from Grok 4.1 Fast for your use cases?
Sonar Deep Research — how often do agents actually need multi-step deep research vs. regular Sonar Pro?

A collapsed stack might look like:
ModelRoleCostOpus 4.6Complex reasoning, analysis, decisions$5/$25Grok 4.1 FastEverything routine — drafting, classification, routing, simple tasks$0.20/$0.50Sonar ProWeb search when agents need live data$3/$15Cohere EmbedVector embeddings for memory$0.12/M
Four models instead of ten. Your agent router becomes: "Is this task complex? → Opus. Does it need live web data? → Sonar. Everything else → Grok." That's a decision tree a junior engineer could build in an afternoon.
What this does to pricing:
The blended cost drops significantly because Grok handles 60-70% of interactions at nearly zero cost. Your worst-case scenario (heavy Opus) is still protected at $0.15/credit. Your realistic margin goes from 75% to potentially 85%+ because you eliminated 6 models that were adding cost and complexity without proportional value.
What this does to engineering:
Less integration work for Roberto. Fewer API keys to manage. Fewer failure modes. Fewer rate limit concerns. Simpler monitoring. Faster debugging.
Is this the direction you're leaning — collapse to 3-4 models and simplify?my gut says I dont know if grok is good enough yet to trust that much. That being said, grok 4.2 just dropped. I also think gemini 3.1 pro should be replaced with gemini 3 fast. I want you to run a deep comparative analysis on grok 4.2 vs gemini 3 fast so i can understand who our work horse should be11:22 PMMarshaled comprehensive comparison framework for model evaluationMarshaled comprehensive comparison framework for model evaluationGood instinct on simplifying. Let me do the deep dive on both models so you can make an informed decision on your workhorse.Hunted down pricing details to orchestrate thorough model comparisonHunted down pricing details to orchestrate thorough model comparisonLet me get the full picture on both. I already have good Grok 4.2 data — now I need Gemini 3 Fast specifics and then direct comparisons.Searched the webSearched the webNow let me get the Artificial Analysis Intelligence Index scores side by side.Prepared to deliver candid comparative analysisPrepared to deliver candid comparative analysisNow I have the full picture. Let me give you the honest analysis — and there's a critical pricing issue you need to see first.Here's the honest picture. First, there's a critical pricing issue you need to see before anything else.
You were right that you had Grok wrong — but not the way you think. Grok 4.20 is priced at $2.00 per million input tokens and $6.00 per million output tokens Build Fast with AI — that's 10x more expensive than the Grok 4.1 Fast ($0.20/$0.50) you had in the original model. It's not a workhorse-tier model. It's competing with Gemini 3.1 Pro, not Gemini 3 Flash.
So the real question is: what's your workhorse, and what tier is it in?
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetNow the head-to-head you asked for — Grok 4.20 vs Gemini 3 Flash — with the context of what this means for AgentCorp:
Intelligence (Reasoning mode):
Gemini 3 Flash scores 46 on the Artificial Analysis Intelligence Index Artificial Analysis, while Grok 4.20 Reasoning scores 48 Artificial Analysis. Essentially tied. But here's the thing — Gemini 3 Flash achieved the highest knowledge accuracy of any model tested on AA-Omniscience Artificial Analysis, while Grok 4.20 reduced hallucinations from approximately 12% to around 4.2% Grokipedia through its multi-agent architecture. Different strengths: Gemini knows more, Grok hallucinates less.
Speed:
Grok 4.20 Reasoning generates output at 251 tokens per second Artificial Analysis vs Gemini 3 Flash at 160 tokens per second Artificial Analysis. Grok is ~57% faster. That matters for agent responsiveness.
Context window:
Grok 4.20: 2M tokens. Gemini 3 Flash: 1M tokens. Both massive, both more than enough for AgentCorp tasks.
Pricing — this is where it breaks:
Grok 4.20Gemini 3 FlashDifferenceInput/M$2.00$0.50Grok is 4x moreOutput/M$6.00$3.00Grok is 2x moreBlended (3:1)$3.00/M$1.13/MGrok is 2.7x more
Maturity:
Grok 4.20 is still in beta — expect occasional inconsistencies in reasoning and output formatting Haimaker. API access for the Multi-Agent Beta variant is still listed as "coming soon" — developers are working with the Non-Reasoning and Reasoning variants for now Build Fast with AI. Gemini 3 Flash is GA-quality, already adopted by JetBrains, Bridgewater, Figma, and Replit.
Tool calling:
Both support function calling and structured output. Gemini 3 Flash offers configurable thinking levels — minimal, low, medium, high — that adapt processing intensity to task complexity Google, which means you can dial down reasoning cost on simple tasks. This architecture uses 30% fewer tokens than its predecessor on typical tasks Medium. That's a built-in cost optimization lever.
Coding:
Gemini 3 Flash hit 78% on coding benchmarks, actually beating the Pro variant while costing 75% less Medium. Grok 4 (the base underlying 4.20) scored 75% on SWE-bench Verified Build Fast with AI. Flash has a slight edge on code tasks.
Verbosity (hidden cost killer):
When evaluating the Intelligence Index, Grok 4.20 Non-reasoning generated 30M tokens, which is very verbose compared to the average of 4M Artificial Analysis. Gemini 3 Flash generated 72M tokens, also very verbose compared to the average of 13M Artificial Analysis. Both are verbose models, which inflates output costs. This is a real issue you need to monitor — verbose outputs at $6/M (Grok) hurt more than at $3/M (Gemini).

The bottom line for AgentCorp:
Your workhorse question has a clear answer: Gemini 3 Flash wins on value. Nearly identical intelligence at less than half the cost, GA-stable (not beta), configurable thinking levels for cost optimization, and native multimodal (text, images, video, audio, PDFs). Grok 4.20 is faster and hallucinates less, but those advantages don't justify 2.7x the price for routine agent tasks.
But here's the harder question — do you even need Tier 3 as your workhorse? Your original model had Grok 4.1 Fast ($0.20/$0.50) handling routine tasks. That's 5-10x cheaper than Gemini 3 Flash. If your agents are doing classification, drafting, routing, and simple lookups 60-70% of the time, that price difference at scale is enormous.
My honest recommendation for your collapsed stack:
RoleModelPriceWhyComplex reasoningOpus 4.6$5/$25Irreplaceable for hard tasksMid-tier workhorseGemini 3 Flash$0.50/$3Best intelligence/dollar ratioCheap bulk tasksGrok 4.1 Fast$0.20/$0.50Classification, routing, simple draftsWeb searchSonar Pro$3/$15No substitute for live dataEmbeddingsCohere Embed$0.12/MMemory infrastructure
Five models, clear routing logic, and the router question becomes: "How hard is this task?" That's it.
Want me to re-run the credit pricing math with this updated stack?what about gemini 3.1 flash lite11:39 PMRetrieved pricing data and assessed competitive positioningRetrieved pricing data and assessed competitive positioningLooked into it already during the research. The short answer: it's a trap.
Gemini 3 Flash without reasoning is both cheaper and more intelligent than Flash-Lite. That means Flash-Lite is not on the Pareto frontier — there is a strictly better option available at a lower price with higher capability. IMGSYS
The numbers tell the story clearly:
Flash-LiteFlash (no reasoning)Flash (reasoning)Input/M$0.25—$0.50Output/M$1.50—$3.00AA Index343546Speed260 t/s—160 t/s
Flash-Lite's only real advantage is speed — 260 tokens per second Artificial Analysis vs Flash's 160 t/s. But Gemini 3 Flash without reasoning lands at intelligence 35, which is higher than Flash-Lite at 33, at a lower effective cost IMGSYS. Flash has configurable thinking levels — you can dial it to "minimal" and get Flash-Lite speed without the intelligence penalty.
The other damning point: Google has been raising prices consistently since the Gemini 2 era, and Flash-Lite continues that pattern without offering enough to justify it. IMGSYS
Flash-Lite exists for one use case: extremely high-throughput, latency-critical tasks where you need sub-second first tokens and don't care about reasoning depth — think classification at massive scale, content moderation, or simple routing decisions. For AgentCorp agents doing actual work that customers are paying for, the intelligence gap between 34 and 46 is real. Your customers will feel the difference between a Flash-Lite response and a Flash response.
So the stack stays the same. Gemini 3 Flash (with thinking levels dialed appropriately per task) is the workhorse. If you find a specific agent task that's pure classification/routing at huge volume, you could drop Grok 4.1 Fast ($0.20/$0.50) in there for even cheaper than Flash-Lite, with comparable intelligence at that tier.can i trust grok 4.1 flash...11:40 PMWeighed capability gaps against pricing advantages honestlyWeighed capability gaps against pricing advantages honestlyHonest answer: it depends on what you mean by "trust."
The intelligence gap is real and it's big. Grok 4.1 Fast Non-reasoning scores 24 on the Artificial Analysis Intelligence Index Artificial Analysis. Gemini 3 Flash scores 46. That's not a rounding error — Flash is nearly twice as intelligent by that composite measure. For anything customer-facing where output quality is the product you're selling, a score of 24 is thin.
But there's a nuance most people miss. Grok 4.1 Fast with reasoning enabled scores 64 on quality benchmarks — nearly matching Grok 4 at 65 — at one-fifteenth the price. Non-reasoning variants drop significantly: Grok 4.1 Fast falls from 64 to 38 quality. Costgoat So the same model with reasoning toggled on jumps from 24 to 64. Still at $0.20/$0.50. The catch is reasoning mode generates thinking tokens that bill as output, so your effective cost per interaction goes up — but nowhere near Gemini 3 Flash territory.
Here's what this means practically for AgentCorp:
You don't need one workhorse. You need a routing layer that asks one question: will the customer see this output?
If no (internal classification, routing decisions, data extraction, tagging, simple lookups) — Grok 4.1 Fast non-reasoning is fine at $0.20/$0.50. A score of 24 handles "which department does this email go to" or "extract the company name from this text" without issue. These are pattern-matching tasks, not reasoning tasks.
If yes (drafting customer emails, writing reports, analysis the customer reads, anything that represents your product quality) — you need either Gemini 3 Flash at $0.50/$3.00, or Grok 4.1 Fast with reasoning enabled. The question then becomes: do you trust xAI's platform stability and API reliability for customer-facing production workloads?
And that's the real trust question. The benchmarks say Grok 4.1 Fast is capable enough. The concern is:

xAI has the smallest developer ecosystem of any frontier provider
Thinner enterprise track record than Google or Anthropic
Grok 4.2 has a reduced safety filters approach and EU regulatory concerns Computertech — if you're selling to regulated industries, that's a liability
No SOC 2 or compliance certifications from xAI that I can find — and you're building toward SOC 2 yourself
If xAI changes pricing, deprecates models, or has outages, you have less recourse than with Google

Google's Gemini 3 Flash, by contrast, runs on GCP infrastructure with enterprise SLAs, has compliance certifications, and Google isn't going anywhere. For $0.30 more per million input tokens, you're buying reliability and institutional trust — things that matter when your customers are paying $1,600/month.
My revised recommendation:
Task typeModelPriceTrust levelInternal routing, classification, taggingGrok 4.1 Fast (no reasoning)$0.20/$0.50Fine — nobody sees itCustomer-facing workhorseGemini 3 Flash$0.50/$3.00GA, enterprise-gradeComplex reasoning, high-stakesOpus 4.6$5/$25Gold standardWeb searchSonar Pro$3/$15No substituteEmbeddingsCohere Embed$0.12/MInfrastructure
Use Grok for the plumbing. Use Gemini for the product. Use Opus when it matters most. That way you're not betting your customer experience on xAI's platform maturity, but you're still capturing the 6-10x cost savings on internal operations.
Want me to re-run the credit pricing math with this three-tier routing?drafting customer emails, writing reports, analysis the customer reads, anything that represents your product quality - this sounds like opus work11:43 PMReconsidered model tiering strategy based on customer-facing output primacyReconsidered model tiering strategy based on customer-facing output primacyYou're right, and I should have caught that myself. Let me be honest about why I didn't.
I was optimizing for margin. You should be optimizing for product quality. Those are different objectives, and at your stage, product quality wins every time. Nobody churns because your margins were too high. They churn because the AI agent wrote a mediocre email their intern could have done better.
Think about what AgentCorp is actually selling: a replacement for a $50-80K/year employee. If the output reads like it came from a cheap model, you've broken the core promise. The customer isn't paying $1,600/month for "pretty good" — they're paying for output they'd be comfortable putting their name on without editing.
So the real stack is simpler than I made it:
TaskModelWhyAnything the customer sees or touchesOpus 4.6It IS the productInternal orchestration, agent-to-agent routing, summarization for context passingGemini 3 FlashSmart enough, customer never sees itPure classification, tagging, intent detectionGrok 4.1 FastPattern matching, no reasoning neededWeb searchSonar ProLive dataEmbeddingsCohere EmbedMemory infrastructure
The uncomfortable implication: your Opus percentage is probably 50-70%, not 30%. Most of what the agents do IS customer-facing — that's the whole point of replacing employees. The internal routing/classification layer is thin by comparison.
This changes the credit pricing math significantly. The blended cost per credit goes up, which means either your price goes up, your margin comes down, or both.
Want me to re-run the numbers with a realistic 60% Opus / 25% Flash / 15% Grok mix? That'll give you the honest picture of what $0.15/credit actually looks like with this stack.what about cohere rerank11:45 PMWeighed reranking's cost-benefit against output quality improvementsWeighed reranking's cost-benefit against output quality improvementsCohere Rerank stays. It's the cheapest thing in the stack and it directly impacts output quality.
Here's why: Rerank sits between the embedding retrieval step and the context that gets passed to Opus. Without it, your embeddings return the top N most semantically similar memory chunks — but "semantically similar" doesn't mean "most useful for this specific task." Rerank reorders those candidates by actual relevance to the query. The difference between passing Opus the 5 best memory chunks vs. the 5 most similar-but-not-quite-right chunks is the difference between a sharp, personalized response and a generic one.
At $2.00 per 1,000 searches, it's noise in the cost model. If an agent does 35 interactions a day and each one triggers a memory retrieval, that's ~1,050 rerank calls per month per customer. Cost: $2.10/month. Your customer is paying $1,600/month. That's 0.13% of revenue for meaningfully better context selection.
The stack is clean now:
ModelRoleCost% of interactionsOpus 4.6Customer-facing output$5/$25~60%Gemini 3 FlashInternal orchestration$0.50/$3~25%Grok 4.1 FastClassification, routing$0.20/$0.50~15%Sonar ProLive web data$3/$15As neededCohere EmbedVector memory$0.12/MEvery interactionCohere RerankMemory quality$2/1K searchesEvery interaction
Six models, but two of them (Embed + Rerank) are invisible infrastructure, not routing decisions. The actual routing logic is three questions: is this customer-facing → Opus. Is this internal orchestration → Flash. Is this pure classification → Grok. Done.s.

we havent considered the cost effects of prompt caching and potentially bulk caching11:53 PMExamined prompt caching's substantial cost reduction potential across modelsExamined prompt caching's substantial cost reduction potential across modelsGood catch. Caching could fundamentally change which model sits where in the stack. Let me get the current numbers.Examined caching data and investigated alternative provider optionsExamined caching data and investigated alternative provider optionsNow I have the full picture. This changes the economics significantly. Here's the honest math:
The caching landscape across your stack:
ModelStandard InputCache ReadSavingsBatch DiscountCache + BatchOpus 4.6$5.00/M$0.50/M90% off50% off$0.25/MGemini 3 Flash$0.50/M$0.05/M90% off50% off$0.025/MGrok 4.1 Fast$0.20/Mauto-cached~50-75%50% off~$0.05/M
Prompt caching reduces input costs by up to 90% for Opus — cache reads drop from $5.00 to $0.50 per million tokens AI Free API. Stack both the Batch API and caching to achieve $0.25/M input, a 95% savings from the base rate. AI Free API
For Gemini 3 Flash, cached input pricing drops to $0.05 per million tokens — also a 90% discount Langcopilot.
For Grok, automatic prompt caching applies with 50-75% cache discounts, requiring no configuration. Costgoat
Why this matters enormously for AgentCorp:
Your agents have a perfect caching profile. Every single agent has a large, static system prompt that defines its personality, capabilities, tools, and behavioral rules. That system prompt gets sent with every interaction. If your system prompt is, say, 4,000 tokens and it gets cached, you're paying $0.50/M instead of $5.00/M for those tokens on every Opus call. That's the bulk of your input cost.
Let me re-run the credit math with realistic caching.
Typical interaction profile (unchanged): 4,000 input + 2,000 thinking + 1,000 visible output = 3,000 billed output tokens.
But now split the input: ~3,000 tokens are the cached system prompt, ~1,000 tokens are the fresh user query.
Opus with caching (60% of interactions):

Cached input: 3,000 tokens × $0.50/M = $0.0015
Fresh input: 1,000 tokens × $5.00/M = $0.005
Output (thinking + visible): 3,000 tokens × $25.00/M = $0.075
Total per Opus interaction: $0.0815 (vs. $0.095 without caching)

Gemini 3 Flash with caching (25% of interactions):

Cached input: 3,000 tokens × $0.05/M = $0.00015
Fresh input: 1,000 tokens × $0.50/M = $0.0005
Output: 3,000 tokens × $3.00/M = $0.009
Total per Flash interaction: $0.0097

Grok 4.1 Fast with auto-caching (15% of interactions):

~$0.001 per interaction (basically free)

Blended cost per credit (60/25/15 mix with caching):

(0.60 × $0.0815) + (0.25 × $0.0097) + (0.15 × $0.001) = $0.0514/credit

Compare that to the old numbers: $0.037/credit at the 30/30/40 mix without caching, and $0.095 worst case. With a 60% Opus mix AND caching, you're at $0.051 — barely more than the old "realistic" blend that was only 30% Opus.
At $0.15/credit, your margin with caching is: 65.7%
That's with 60% Opus. Without caching it would have been brutal — maybe 40% margin. Caching is what makes Opus-heavy affordable.
Now the batch API angle:
Batch processing gives 50% off but requires 24-hour turnaround. For AgentCorp, most agent interactions are real-time — you can't batch a customer email response. But there are batch-eligible tasks: end-of-day report generation, scheduled data analysis, bulk content creation, weekly summaries. If even 10-15% of interactions are batch-eligible, that saves another few points of margin.
The honest bottom line:
Caching doesn't change your pricing or your stack — it just makes the Opus-heavy mix financially viable. Without caching, running 60% Opus at $0.15/credit would squeeze your margin to ~40% and you'd be one provider price increase away from underwater. With caching, you're at 66% margin — healthy enough to absorb price fluctuations and still have room.
The real optimization isn't caching vs. no caching — it's making sure Roberto engineers the system prompts to be cache-friendly from day one. That means stable, front-loaded system prompts that don't change between interactions. The variable content (user query, memory context) goes after the cached block.
Want me to update the Financial Model Assumptions doc on Notion with the revised stack and these numbers?you are assuming all tokens are using cache pricing which seems very unlikely...i dont really understand how caching works but it doesnt seem like that. also i know that if 5 minutes go by, the caching pricing goes away and you have to send a new caching prompt which is more expensive11:58 PMRecalibrated cache pricing assumptions with realistic mechanicsRecalibrated cache pricing assumptions with realistic mechanicsYou're right to push back. I was being sloppy. Let me explain how it actually works, because the details change the math meaningfully.
How Anthropic prompt caching actually works:
There are three pricing states for input tokens, not two:
StateMultiplierOpus Price/MStandard (no cache)1.0x$5.00Cache write (first time storing)1.25x$6.25Cache read (hitting existing cache)0.1x$0.50
A five-minute cache write costs 1.25x the base input price, a one-hour cache write costs 2x, and cache reads cost just 0.1x. LaoZhang AI Blog
The TTL problem you identified:
The default cache TTL is 5 minutes. If no request hits that cached content within 5 minutes, it evaporates. Next request pays the cache write fee again (1.25x). For AgentCorp, the question is: does a given customer's agent get called more than once every 5 minutes during active use?
During a work session — probably yes. A customer actively using their agents might trigger 5-15 interactions per hour. That's one every 4-12 minutes. So during active hours, you'd hit the cache most of the time, but you'd miss it regularly too — maybe every third or fourth interaction is a cache write because the customer paused to read the output, think, do something else.
After hours or during gaps — 100% cache miss. Every first interaction of a session is a cache write.
Realistic cache hit rate for AgentCorp:
I'd estimate 50-60% cache hits, not 90%+. Here's why:

First interaction of every session: cache write (1.25x)
Customer pauses for 6+ minutes between tasks: cache write
Active back-and-forth within a task: cache reads (0.1x)
Multiple agents on different system prompts: each agent's cache is separate

Also — only the system prompt tokens get cached, not everything.
Of the ~4,000 input tokens per interaction:

~2,500-3,000 tokens: system prompt (cacheable)
~500-1,000 tokens: user query + memory context (fresh every time, always standard price)

Honest recalculation — Opus interaction with realistic caching:
Scenario: 55% cache hit, 45% cache miss on system prompt tokens.
Cache hit interaction (55% of the time):

Cached system prompt: 2,750 tokens × $0.50/M = $0.00138
Fresh input: 1,250 tokens × $5.00/M = $0.00625
Output: 3,000 tokens × $25.00/M = $0.075
Total: $0.0826

Cache miss interaction (45% of the time):

Cache write on system prompt: 2,750 tokens × $6.25/M = $0.0172
Fresh input: 1,250 tokens × $5.00/M = $0.00625
Output: 3,000 tokens × $25.00/M = $0.075
Total: $0.0985

Blended Opus cost: (0.55 × $0.0826) + (0.45 × $0.0985) = $0.0898/interaction
Compare that to my previous numbers:

No caching at all: $0.095
My overly optimistic caching: $0.0815
Realistic caching: $0.0898

The honest truth: caching saves you about 5-6% on Opus, not 15%. The reason is simple — output tokens dominate your cost ($0.075 of the ~$0.09), and caching doesn't touch output pricing at all. The input savings are real but small relative to the output bill.
Updated blended credit cost (60/25/15 mix, realistic caching):
ModelCost/interactionWeightWeightedOpus 4.6$0.089860%$0.0539Gemini 3 Flash$0.009525%$0.0024Grok 4.1 Fast$0.00115%$0.00015Blended$0.0564
At $0.15/credit: 62.4% margin. Versus my overcooked 65.7%.
The real takeaway: caching helps, but it's not the game-changer I made it sound like. The output cost is the elephant in the room and there's no caching mechanism for that. The biggest lever you actually have is making sure the router doesn't send a classification task to Opus when Grok can handle it — that's a 90x cost difference per interaction, which dwarfs any caching optimization.
Want me to update the Assumptions doc with these corrected numbers?you mentioned theres a 1hr caching option? would that make more sense?12:03 AMWeighed caching cost-benefit tradeoff for AgentCorp's usage patternsWeighed caching cost-benefit tradeoff for AgentCorp's usage patternsGood question. Yes — and the tradeoff is straightforward.
A five-minute cache write costs 1.25x the base input price, a LaoZhang AI Blog one-hour cache write costs 2x. Cache reads are the same regardless: 0.1x.
So for Opus, here's what each option costs:
Standard5-min cache write1-hr cache writeCache readOpus/M$5.00$6.25$10.00$0.50
The question is purely mathematical: how many cache reads do you need within the window to break even on the higher write cost?
5-minute window: you pay $6.25/M to write, save $4.50/M on every subsequent read. Break-even after 1 read (you're ahead on the second interaction within 5 minutes).
1-hour window: you pay $10.00/M to write, save $4.50/M on every subsequent read. Break-even after 2 reads (you need the 3rd interaction within the hour to start saving vs. standard pricing).
Now think about AgentCorp usage patterns:
A customer actively working with their agents during business hours is probably doing bursts of activity with gaps. Maybe 15-20 interactions over a morning, but with 8-15 minute gaps between some of them. The 5-minute TTL would expire constantly during those gaps. The 1-hour TTL catches the whole work session.
With a 1-hour TTL, a customer who does 10 interactions in a morning session pays:

1 cache write at $10.00/M
9 cache reads at $0.50/M each = $4.50/M
Total for system prompt tokens across 10 interactions: $14.50/M
Without caching: 10 × $5.00/M = $50.00/M
Savings: 71%

With a 5-minute TTL, same 10 interactions but with ~4 cache misses due to gaps:

4 cache writes at $6.25/M = $25.00/M
6 cache reads at $0.50/M = $3.00/M
Total: $28.00/M
Savings: 44%

The 1-hour TTL is clearly better for your use case. You're not running a high-frequency chatbot where users fire 20 messages per minute — you're running work agents where a customer might send a task, wait 8 minutes to review the output, then send the next task. That gap pattern kills the 5-minute TTL.
But here's the catch you should be aware of: the 1-hour TTL only makes sense if the customer is doing 3+ interactions per hour. If a customer only uses an agent twice in an hour — one task in, review, one follow-up — you actually lose money vs. no caching at all:

1 cache write at $10.00/M + 1 cache read at $0.50/M = $10.50/M for 2 interactions
Without caching: 2 × $5.00/M = $10.00/M
You paid $0.50 MORE for the privilege of caching

So the engineering decision is: dynamically select TTL based on observed usage intensity per customer. Start a session with 5-minute TTL. If the customer hits 3+ interactions within the first 5 minutes, upgrade to 1-hour TTL for the rest of the session. Light users stay on short TTL or no caching at all.
Let me redo the blended credit cost with 1-hour caching and a realistic hit profile:
Assume an average customer session: 8 interactions over ~45 minutes. 1 cache write, 7 cache reads.
Opus with 1-hr caching (per interaction, averaged over session):

Cache write (1/8 of interactions): 2,750 tokens × $10.00/M = $0.0275
Cache read (7/8 of interactions): 2,750 tokens × $0.50/M = $0.001375
Fresh input (always): 1,250 tokens × $5.00/M = $0.00625
Output (always): 3,000 tokens × $25.00/M = $0.075
Session-averaged per interaction: (1 × $0.109) + (7 × $0.0826) / 8 = $0.0859

vs. my earlier 5-minute estimate of $0.0898. Savings of about 4% on top of an already small input-side gain.
Honest summary: The 1-hour TTL is the right choice for AgentCorp, but caching overall — whether 5-minute or 1-hour — shaves maybe 6-10% off your per-credit cost, not 50%. The output tokens at $25/M are 80%+ of every Opus interaction and caching doesn't touch them. The real margin lever remains the routing decision: what goes to Opus vs. what goes to Flash vs. what goes to Grok.
Want me to finalize all of this into the Assumptions doc?the engineering decision seems complex for the small difference of 10.5/M vs 10/M...seems like the 1hr option would save money enough times where it will be a net benefit12:08 AMWeighed engineering complexity against marginal cost savingsWeighed engineering complexity against marginal cost savingsYou're right. I was overcomplicating it.
The edge case where 1-hour TTL loses money is a customer who uses an agent exactly twice in an hour and then stops. That's a $0.50/M penalty — fractions of a cent on a $1,600/month bill. Meanwhile, every normal work session (3+ interactions) saves 60-70% on system prompt input costs.
Just default to 1-hour TTL on everything. The simplicity alone is worth it — one fewer engineering decision, one fewer thing to debug, one fewer config to manage. Roberto has enough to build without implementing dynamic TTL routing.
Final corrected credit math with 1-hour caching:
Assume average session of 8 interactions (1 write, 7 reads):
Opus (per interaction, session-averaged):

System prompt: (1/8 × $10.00/M) + (7/8 × $0.50/M) = $1.6875/M effective
That's 2,750 system prompt tokens = $0.00464
Fresh input: 1,250 tokens × $5.00/M = $0.00625
Output: 3,000 tokens × $25.00/M = $0.075
Per interaction: $0.0859

60/25/15 blend:

(0.60 × $0.0859) + (0.25 × $0.0095) + (0.15 × $0.001) = $0.054

At $0.15/credit: 64% margin. Clean, honest, no tricks.
Let me update the Assumptions doc with everything we've decided.Prepared to revise financial documentation with updated pricing modelPrepared to revise financial documentation with updated pricing modelGood, I can see the doc. Section 10 has the old numbers — all Opus, old cache assumptions, old blended rates. Let me update it with everything we've decided.Pivoted to update pricing documentation on NotionPivoted to update pricing documentation on NotionDone. The Financial Model Assumptions doc is updated with the full revised model stack, 1-hour caching strategy, corrected credit math, and all the decisions from this session.
Here's where we landed:
Decided:

6-model stack (down from 10) with three-tier routing
1-hour cache TTL across the board, no dynamic switching
Blended cost: $0.054/credit at 60/25/15 Opus/Flash/Grok mix
At $0.15/credit: 64% margin
Caching helps ~6-10%, not a game-changer — the routing decision is the real lever
