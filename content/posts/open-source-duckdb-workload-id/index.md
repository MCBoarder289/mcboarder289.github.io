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
This is one of my favorites because I was able to contribute directly to the [DuckDB](https://duckdb.org/) project, which has easily become of my favorite tools as a Data Engineer.

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

I'm sure I'll post more about how awesome DuckDB is in future posts, but let's get to the actual change that was implemented!