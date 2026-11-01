# Code review — 1 November 2026

Review base: `e399544`. Scope: browser behavior, API/data normalization, generation
contracts and Worker, cost arithmetic, build configuration and existing tests.
The first pass focused on correctness and efficiency; an independent code-simplifier
pass reviewed duplication, naming and maintainability.

## Correctness findings

Each of these issues was reproduced with a failing regression test before the fix.

| Finding                                                                                                                                                                                      | Correction                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Location controls could be used before configuration finished; opening the map could access an uninitialized map. Switching languages after a configuration failure re-enabled the controls. | Explicit readiness checks keep location controls disabled until initialization succeeds; map opening is safe during startup. |
| An offer expiring at another store invalidated a valid recipe at the selected store.                                                                                                         | Expiry cleanup updates all store counts but only invalidates generation when the selected store's stock changes.             |
| An offer could expire during inference and still appear in a newly displayed recipe before the next periodic expiry check.                                                                   | Reconcile expired offers when a response arrives, then check the request ID again before accepting the result.               |
| Null geocoder responses and malformed inference error bodies could expose JavaScript TypeErrors or `[object Object]`.                                                                        | Validate these response shapes and use the existing readable error messages without retrying.                                |

The expiry behavior remains conservative within the selected store: a change in
that store's stock invalidates its generation results. Availability at arrival is
still indicative, as described in the application's data limitations.

## Computational efficiency

- Store normalization scans offers once, then sorts the returned stores by distance.
  Salling caps a nearby response at 20 stores. There is no unbounded all-store search
  or quadratic pairwise distance calculation in the application.
- Inspiration still scans the store inventory to filter and deduplicate candidates.
  The rotation now copies at most 60 candidates instead of copying the entire
  filtered inventory again. Overall filtering remains linear in inventory size.
- Recipe cost calculations are bounded by six products and twenty ingredients.
  Additional indexes would add complexity for little benefit at those bounds.
- Currency/date formatters and product-name lookup sets are reused instead of
  repeatedly constructed. A local Node microbenchmark of 10,000 money/date formats
  had median times of about 160 ms before and 3.4 ms after, with matching output.
  This measures formatting only, not page performance or hosted inference latency.

## Simplification boundaries

The code-simplifier pass consolidated generation request lifecycle handling in
`runGeneration()`, replaced nested status expressions with named helpers, and gave
API responses and recipe contexts descriptive names. The recipe dialog computes
its cost once and reuses it. Shared helpers handle HTML escaping and model-output
JSON decoding; mode-specific preparation, result handling and validation remain
distinct. The existing UI structure and styling are preserved.

The following apparent duplication is intentional:

- Quantity validation accepts explicit recipe units and phrases. Purchase-cost
  parsing accepts a narrower set of convertible measurements. Combining these could
  turn an unknown purchase quantity into a misleading price.
- Input text cleaning and generated idea validation use different control-character
  and error rules. They should not be merged merely because both handle strings.
- Model provider branches expose different APIs. There is no automatic fallback or
  retry mechanism, and simplification must not introduce one.

The architecture remains appropriate for a small static frontend with a generation
Worker: data normalization, costs, API clients and generation validation are separate
modules. UI orchestration and HTML rendering are still concentrated in `src/app.js`;
that is the main remaining maintainability tradeoff, rather than an algorithmic
bottleneck. A framework migration is not needed to address the findings above.

## Validation

- 41 unit/API tests and all 23 browser tests pass, including the six new regression
  cases for malformed responses, initialization and expiry behavior.
- Four synthetic input cases produce exactly the same recipe/ideas prompts and
  JSON schemas as before the review.
- Currency/date output matches the original functions in both languages, including
  invalid timestamps and numeric edge cases.
- Production frontend build, Worker packaging dry-run, formatting and diff checks
  pass. Browser tests include mobile layout and automated accessibility checks.

## Review limits

Automated responses are synthetic. These checks establish application behavior,
not culinary quality, dietary suitability, real stock availability or provider
capacity. The model, prompt text, schemas, quotas, cost semantics and privacy
boundaries are preserved. No live generation or production deployment is required
for this refactor.

Cloudflare-specific checks used the installed Workers best-practices guidance,
the project's Wrangler schema and official documentation for
[rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[structured output](https://developers.cloudflare.com/workers-ai/features/json-mode/)
and the [deployed model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/).
