---
title: "Dagster Authkit: Auth for OSS Deployments"
date: 2026-11-03
summary: "Enabling auth for open source deployments of Dagster."
tags: ["Dagster", "data engineering", "security"]
categories: ["open source"]
featureimage: "dagster_auth.jpg"
images: ["dagster_auth.jpg"]
showHero: true
heroStyle: thumbAndBackground
series: 
  - "Open Source Contributions"
series_order: 3
#featured: true
#featuredOrder: 1
---

## Intro
[Dagster](https://dagster.io/) has become my go-to orchestrator this past year. 
It has a beautiful UI, it keeps all of my pipeline work version modular and pythonic, and the local dev experience is phenomenal.

The [software-defined asset approach](https://dagster.io/glossary/software-defined-assets) also has so many benefits when reasoning about a complex data environment.

Like most of my favorite technologies, [Dagster is open-source](https://github.com/dagster-io/dagster).
In my current role, we are transitioning away from Azure Synapse and using Dagster as our "single pane of glass" for our data orchestration needs.
We're self-hosting the open-source distribution of Dagster on our Kubernetes clusters, and like the rest of our infrastructure, we need to ensure we implement these tools with security best practices.

In this article I'll describe how we were able to implement our authentication needs with [Dagster Authkit](https://maltzsama.github.io/dagster-authkit/) and a couple open source contributions I made to solve some issues along the way.

## Authentication in Dagster
By default, in the open source implementation of Dagster there actually is no auth.
This means that anyone who has access to the Dagster URL has full admin access to do what they want with any of the assets/pipelines/resources. Not ideal.

Auth is a first-class feature in Dagster+, their paid hosted option, but for those of us wanting to self-host that leaves us a pretty significant problem to solve.

### Dagster Authkit 
Here is where [Dagster Authkit](https://maltzsama.github.io/dagster-authkit/) comes to save the day.
Their statement in the main README explains it best:

>"Inspired by the community's need for a middle ground between "no auth" and "pay for Dagster+"."

I couldn't agree more. Security and proper auth really shouldn't be a premium feature (see [sso.tax](https://sso.tax/) and the [sso wall of shame](https://github.com/robchahin/sso-wall-of-shame) for the broader community's reactions to this idea)

Dagster Authkit solves this need elegantly by wrapping the dagster-webserver command that will intercept the UI's official GraphQL calls and ensure that the authenticated user has the proper role to do that function.

It uses RBAC (Role Based Access Control) and allows you to define one of four standard roles to perform the proper functions within the Dagster UI:

| Role | Description |
|------|-------------|
| **Admin** | Full access. Can manage users, settings, and all pipelines. |
| **Editor** | Can modify assets and codebase (if allowed) and manage runs. |
| **Launcher** | Can launch runs and re-execute jobs, but cannot modify code/assets. |
| **Viewer** | Read-only. Can view runs and assets. GraphQL mutations are blocked. |


In our case, we use a simple OAuth2 Proxy so that when users hit our Dagster URL, they have to authenticate with Entra ID.
We allow everyone to be a "Viewer", and have managed app roles for the others and that gives us peace of mind that only specified users have the exact limited permissions we want them to have.

## Issues Encountered
Dagster Authkit is exactly what our team needed, but when we began exploring how we'd implement it in our environment, we ran into a couple issues.

1. [Missing CSP Issue](https://github.com/maltzsama/dagster-authkit/issues/4) - Newer versions of Dagster have new Content Security Policies (CSPs), which broke a few visuals on the lineage page and produced some console log errors.
2. [Multiple UI Injection Bugs](https://github.com/maltzsama/dagster-authkit/issues/6) - When Dagster Authkit released 0.4.1, there were some changes that caused a couple of UI regressions.

Let's walk through the solutions for each of these issues!

## Solutions

### Missing CSP Solution
This was a pretty straightforward change since the errors that surfaced simply declared what CSPs needed adjusting.

The diff is pretty self explanatory here:
{{< github-file-diff repo="maltzsama/dagster-authkit" pr="3" file="dagster_authkit/auth/security.py" >}}

The `worker-src 'self' blob:;` was missing altogether, and there were updated font and style sources from `https://cdn.jsdelivr.net`.

Once those changes were in, the console log errors disappeared, and the missing arrows in the lineage graph reappeared.

{{< swap-img light="lineage_page_example.jpg" dark="lineage_page_example.jpg" alt="Screenshot of fixed lineage page" >}}

### UI Injection Solutions
Dagster Authkit also conveniently adds a small menu in the UI that simply displays the authenticated user and role, also allowing you to manually log out.
It's a very lightweight UI addition, but requires some middleware to work properly.

#### Problem 1: Unawaited Coroutine
Dagster uses newer versions of [Starlette](https://starlette.dev/), an async web framework and ASGI toolkit.
If you're not familiar with async vs. sync concepts, the main difference is that a synchronous function will immediately do that work and return the results.
Alternatively, an asynchronous function will defer that work with a coroutine, which allows you to check in to see whenever that work is done.
In an async framework, these coroutines will allow other work to continue that isn't waiting on some response, and eventually return the answer when it's able to complete everything.

The original problem looked like this:

```python {hl_lines=[6]}
if inspect.iscoroutinefunction(original_index_html):
    async def patched_index_html(self, request: Request):
        return await _inject_resilient_ui(self, request)
else:
    def patched_index_html(self, request: Request):
        return _inject_resilient_ui(self, request)
```

UI injection was trying to handle a conditional situation where if it was async, then await the injection, otherwise return it synchronously.
The problem was that the replacement logic it called into (the `_inject_resilient_ui` function) was *always* async, even if the `original_index_html` was not a coroutine function.

That meant that the server would only return the coroutine and not the actual HTTP response it needed, so it threw a 500 error and failed.

The fix was simply to remove that conditional branch altogether and make the function async an await it's result:

```python
async def patched_index_html(self, request: Request):
    return await _inject_resilient_ui(self, request)
```

#### Problem 2: User Menu Silently Missing
With the first bug fixed, the UI could now properly render instead of throwing an error, but it was missing the actual injected user menu it was trying to add to begin with.
This was a little bit trickier to diagnose because the original code looks like it *should* work.

Starlette gives every request a `request.state` object meant to carry extra data (like "who is the logged-in user") between pieces of middleware.
The original code stored that data like this:

```python
scope["state"]["user"] = user
```

That treats the state object like it's a plain dictionary where we can add keys and values to the object.
In newer versions of Starlette, however, that "state" object is an actual separate class altogether that is accessed with dot notation like this:

```python
request.state.user
```

Dictionaries don't have that ".user" property, so it silently returned a `None` value, which was interpreted as "no user is logged in", even if a user was indeed logged in.
To actually store the user we log in as in Starlette properly, we needed to store that in an actual `starlette.datastructures.State` object instead of a dictionary.

That middleware change looked like this:

{{< github-file-diff repo="maltzsama/dagster-authkit" pr="7" file="dagster_authkit/core/middleware.py" >}}

#### Problem 3: Missing Nonce

Lastly, newer versions of Dagster has improved Content Security Policy (CSP) handling, which requires a unique "nonce" value for each request to allow inline scripts to execute safely.
A "nonce" values stands for a "number used once", which is usually a random, one-time secret stamped on a request.

The original code wasn't generating or including this nonce, which caused the CSP to block the injected UI elements.
To fix this, since Dagster's UI was already generating the accepted nonce values on their scripts, we had to simply find that value and include it in the html that we were injecting for the UI.

That particular code looks like this:

```python
_nonce_match = re.search(r'<script[^>]+nonce=["\']([^"\']+)["\']', html)
if _nonce_match:
    injection = injection.replace(
        "<script>",
        f'<script nonce="{_nonce_match.group(1)}">',
        1,
    )
```

We're just using regex to find pre-existing nonce values, retrieve those and replace the script opening tag in our injected html.

Altogether, most of these fixes landed on the `core/patch.py` file here:

{{< github-file-diff repo="maltzsama/dagster-authkit" pr="7" file="dagster_authkit/core/patch.py" >}}

#### Unit Tests
Lastly, as part of this change, I included a [whole set of unit tests](https://github.com/maltzsama/dagster-authkit/pull/7/changes#diff-ea558005b4d170243974dcf45c3dbd0f23601f732013d7935da6288395e4c870) that will catch these same bugs if any future changes re-introduce those by accident.

## Conclusion 
Dagster has been an amazing choice for data orchestration work, and Dagster Authkit fills in the right amount of auth feature gaps without getting in the way.
That has enabled hardened security for the Dagster deployments that are self-hosted, and I'm glad I was able to contribute to some fixes as Dagster's platform continues to evolve!
