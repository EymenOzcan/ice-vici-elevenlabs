# Project Brief: ElevenLabs AI Call App

## Project Overview
The ElevenLabs AI Call App is a Node.js application that integrates ElevenLabs' conversational AI service with Asterisk-based telephony systems (specifically OSdial, a fork of Vicidial). The application enables AI-powered voice agents to handle inbound and outbound calls through Asterisk's AudioSocket protocol.

## Core Requirements
1. Connect ElevenLabs conversational AI agents to telephone calls
2. Support both inbound and outbound calling
3. Integrate with OSdial/Vicidial as virtual/remote agents
4. Handle audio streaming between callers and AI agents
5. Manage multiple concurrent calls with different AI agents

## Goals
- Enable fully automated AI-powered telephone conversations
- Allow AI agents to appear as regular agents within OSdial
- Support campaign-based routing of calls to appropriate AI agents
- Provide a scalable solution for handling multiple concurrent calls

## Technical Scope
- Node.js application with WebSocket server
- Integration with Asterisk via AudioSocket protocol
- Integration with ElevenLabs API for conversational AI
- Connection management for multiple concurrent calls
- Dynamic port allocation for audio streaming

## Stakeholders
- Call center operators using OSdial/Vicidial
- End users receiving or making calls to the AI agents
- System administrators managing the telephony infrastructure

## Success Criteria
- Successful integration with OSdial as virtual/remote agents
- Reliable audio streaming between callers and AI agents
- Ability to scale to handle multiple concurrent calls
- Proper call management (initiation, termination, error handling)
