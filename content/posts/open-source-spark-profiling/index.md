---
title: "Data Profiling with Spark"
date: 2026-09-13
summary: "Walkthrough of my open source contributions to fg-data-profiling, a library that implements data profiling at scale with Spark."
tags: ["spark", "data engineering", ""]
categories: ["open source"]
featureimage: "spark_plus_profiling.jpg"
showHero: true
heroStyle: thumbAndBackground
series: 
  - "Open Source Contributions"
series_order: 1
---

## Series Intro
In this series, I will share my experiences in contributing to open source software.
I have really enjoyed being able to contribute back to libraries that have been useful in my career, and want to encourage and inspire others to jump in and do the same!

## Background

One of the foundational activities when trying to assess data quality at scale is data profiling.
Put simply, it's doing some of the high-level gathering of key exploratory metrics like:

> [!example]
> * Row Counts
> * Numerical column statistics (mean, median, distributions)
> * Categorical column information (distinct values, distinct counts)
> * Fill rates of columns (how many are null?)

Last year, my company asked us to perform a large-scale data quality initiative, so we had a need for an efficient process that could deliver exploratory insights in a repeatable fashion.


We needed a process that supported tables with tens of millions of records, most of which are delta lake tables in our data lake, and we landed on a tool called [fg-data-profiling](https://github.com/data-centric-ai-community/fg-data-profiling)

{{< github repo="data-centric-ai-community/fg-data-profiling" showThumbnail=true >}}

