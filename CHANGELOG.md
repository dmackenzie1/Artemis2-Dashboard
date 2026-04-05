# Changelog

## [Unreleased]
- fix: make transcript PostgreSQL features optional for non-Docker local development and add direct workspace dev scripts. Intent: Let developers run server/client locally without requiring Docker or a running database unless transcript context APIs are needed.
- feat: add PostgreSQL-backed transcript ingestion pipeline with streaming CSV imports and LLM context retrieval endpoint. Intent: Persist large communication transcript datasets for memory-efficient ingestion and prompt-ready querying on constrained infrastructure.
- refactor: relocate backend and frontend workspaces under docker/server and docker/client. Intent: Match repository layout to the requested container-oriented ownership model while preserving existing build/test workflows.
- feat: add end-to-end Artemis 2 mission intelligence prototype with CSV ingestion, LLM-derived summaries/topics/chat, and mission-control dashboard. Intent: Deliver a fast, demo-ready internal system for transcript-driven mission situational awareness.
- chore: standardize container files under /docker/client, /docker/server, and /docker/nginx. Intent: Align Docker asset layout with team workflow and simplify container ownership boundaries.

