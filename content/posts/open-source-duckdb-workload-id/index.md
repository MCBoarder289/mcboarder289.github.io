---
title: "DuckDB Delta with Azure Workload Identity"
date: 2026-09-20
summary: "Walkthrough of my open source contributions to fg-data-profiling, a library that implements data profiling at scale with Spark."
tags: ["DuckDB", "Azure", "AKS", "data engineering"]
categories: ["open source"]
featureimage: "duckdb_aks_entra_textured.jpg"
images: ["duckdb_aks_entra_textured.jpg"]
showHero: true
heroStyle: thumbAndBackground
series: 
  - "Open Source Contributions"
series_order: 2
draft: true
---

## Intro
This is one of my favorite open source contributions that I've made.
Not because it's the most impressive change or something revolutionary.
It's because I was able to contribute directly to the [DuckDB](https://duckdb.org/) project, which has easily become of my favorite tools as a Data Engineer.

> Still get excited seeing a contributor badge here:
{{< swap-img light="contributor_light.png" dark="contributor_dark.png" alt="Screenshot of a Github post with a contributor badge to duckdb-delta" >}}

## What is DuckDB?
If you haven't heard of DuckDB before, let me introduce you to one of the most exciting new technologies for those of us in the data analytics space.

DuckDB is a lot of things, but at its core, it's an in-process database designed for analytical use cases. 
It is often described as the SQLite for OLAP scenarios, but it really is so much more.

You can use it to query files directly with SQL and use it as its own query engine.
For example, if I have a local file, I simply query it like this:

```sql
SELECT
    city
    ,count(1)
FROM read_csv("/path/to/some/data.csv")
GROUP BY
    city
```

Plus it comes with a fancy notebook-based CLI that you can use:

{{< gifvideo src="duckdb_ui.webm" alt="Animated demonstration of the application" >}}

Did I also mention that it's crazy fast?

I'm sure I'll post more about how awesome DuckDB is in future posts, but let's get to the actual change that was implemented!

## Background
In my current role, I have been designing and implementing a more modern data platform for our Data Engineering and Data Science teams.
The core of this new architecture is using [Azure Kubernetes Service (AKS)](https://azure.microsoft.com/en-us/products/kubernetes-service) with [Dagster (OSS, self-hosted)](https://dagster.io/platform-overview/data-orchestration) orchestrating all of our pipelines.

By the way, we're using the `AKS Automatic` variant so that we don't have to manage node pools, and it's been a fantastic experience.

Using AKS means that the compute for our pipeline jobs spins up what it needs, when it needs it, and then spins it back down.
Authenticating to our data lake is critical to ensure that we have secure access with the right scope of privileges.
Basically, we need to be able to read and write to our data lake securely.

The modern best-practice is to use a workload identity instead of some password or secret based credential.

### Workload Identity in AKS
Azure provides the ability to define workload identities with permissions, and then assign those identities to AKS clusters.
Instead of wiring in secrets with environment variables or manages secrets in KeyVault, all of which would need to be rotated manually, workload identities will manage and provision short-lived tokens automatically for us.

This means that we can have all of our AKS pods, such as our Dagster pipeline runs, using a particular workload identity with just the right access that it needs without having to wire in secrets or worry about rotation.
It leverages [OpenID Connect (OIDC)](https://openid.net/developers/how-connect-works/), and is considered best practice for security.

### DuckDB Auth in Azure
DuckDB implements authentication with Azure with the [Azure extension](https://duckdb.org/docs/lts/core_extensions/azure).
The most convenient way is using the [credential_chain](https://duckdb.org/docs/lts/core_extensions/azure#credential_chain-provider) provider so that Azure can simply run through a chain of methods to authenticate automatically based how you've configured your process.

In our case, since AKS is providing us the workload identity for us on each pod, we can specifically call out the `workload_identity` path for Azure's credentialing method.
DuckDB would then be able to read and write to our data lake with the appropriate permissions without us having to do much else besides a couple lines like this for the connection:

```sql
CREATE SECRET az_wi (
    TYPE AZURE,
    PROVIDER CREDENTIAL_CHAIN,
    CHAIN 'workload_identity',
    ACCOUNT_NAME 'my_storage_account'
);
```

## The Problem
Most of our data lake uses [Delta Lake](https://docs.delta.io/) tables, which is an open table format the enables ACID transactions to our tables and is the default table format for [Spark](https://spark.apache.org/).
To read from those delta tables, DuckDB requires the [Delta Extension](https://duckdb.org/docs/lts/core_extensions/delta), which allows DuckDB to correctly navigate the format and read the metadata layer/delta logs efficiently.

*This* is where we ran into issues.

The Delta Extension for DuckDB was not accessing the workload identity, and we were hitting auth issues which prevented us from reading those delta tables.
However, we *were* able to read parquet files directly with the workload identity.

That gives us a clue that there are different auth paths at play here, so let's dive into the details and how I was able to resolve the issue.

### Test Driven Development







