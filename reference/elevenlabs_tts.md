# WebSocket

GET /v1/text-to-speech/{voice_id}/stream-input

The Text-to-Speech WebSockets API is designed to generate audio from partial text input
while ensuring consistency throughout the generated audio. Although highly flexible,
the WebSockets API isn't a one-size-fits-all solution. It's well-suited for scenarios where:
  * The input text is being streamed or generated in chunks.
  * Word-to-audio alignment information is required.

However, it may not be the best choice when:
  * The entire input text is available upfront. Given that the generations are partial,
    some buffering is involved, which could potentially result in slightly higher latency compared
    to a standard HTTP request.
  * You want to quickly experiment or prototype. Working with WebSockets can be harder and more
    complex than using a standard HTTP API, which might slow down rapid development and testing.


Reference: https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input

## AsyncAPI Specification

```yaml
asyncapi: 2.6.0
info:
  title: V 1 Text To Speech Voice Id Stream Input
  version: subpackage_v1TextToSpeechVoiceIdStreamInput.v1TextToSpeechVoiceIdStreamInput
  description: >
    The Text-to-Speech WebSockets API is designed to generate audio from partial
    text input

    while ensuring consistency throughout the generated audio. Although highly
    flexible,

    the WebSockets API isn't a one-size-fits-all solution. It's well-suited for
    scenarios where:
      * The input text is being streamed or generated in chunks.
      * Word-to-audio alignment information is required.

    However, it may not be the best choice when:
      * The entire input text is available upfront. Given that the generations are partial,
        some buffering is involved, which could potentially result in slightly higher latency compared
        to a standard HTTP request.
      * You want to quickly experiment or prototype. Working with WebSockets can be harder and more
        complex than using a standard HTTP API, which might slow down rapid development and testing.
channels:
  /v1/text-to-speech/{voice_id}/stream-input:
    description: >
      The Text-to-Speech WebSockets API is designed to generate audio from
      partial text input

      while ensuring consistency throughout the generated audio. Although highly
      flexible,

      the WebSockets API isn't a one-size-fits-all solution. It's well-suited
      for scenarios where:
        * The input text is being streamed or generated in chunks.
        * Word-to-audio alignment information is required.

      However, it may not be the best choice when:
        * The entire input text is available upfront. Given that the generations are partial,
          some buffering is involved, which could potentially result in slightly higher latency compared
          to a standard HTTP request.
        * You want to quickly experiment or prototype. Working with WebSockets can be harder and more
          complex than using a standard HTTP API, which might slow down rapid development and testing.
    parameters:
      voice_id:
        description: The unique identifier for the voice to use in the TTS process.
        schema:
          type: string
    bindings:
      ws:
        query:
          type: object
          properties:
            authorization:
              type: string
            model_id:
              type: string
            language_code:
              type: string
            enable_logging:
              type: boolean
            enable_ssml_parsing:
              type: boolean
            output_format:
              $ref: '#/components/schemas/output_format'
            inactivity_timeout:
              type: integer
            sync_alignment:
              type: boolean
            auto_mode:
              type: boolean
            apply_text_normalization:
              $ref: '#/components/schemas/apply_text_normalization'
            seed:
              type: integer
        headers:
          type: object
          properties:
            xi-api-key:
              type: string
    publish:
      operationId: v-1-text-to-speech-voice-id-stream-input-publish
      summary: subscribe
      description: Receive messages from the WebSocket
      message:
        name: subscribe
        title: subscribe
        description: Receive messages from the WebSocket
        payload:
          $ref: '#/components/schemas/V1TextToSpeechVoiceIdStreamInputSubscribe'
    subscribe:
      operationId: v-1-text-to-speech-voice-id-stream-input-subscribe
      summary: publish
      description: Send messages to the WebSocket
      message:
        name: publish
        title: publish
        description: Send messages to the WebSocket
        payload:
          $ref: '#/components/schemas/V1TextToSpeechVoiceIdStreamInputPublish'
servers:
  Production:
    url: wss://api.elevenlabs.io/
    protocol: wss
    x-default: true
  Production US:
    url: wss://api.us.elevenlabs.io/
    protocol: wss
  Production EU:
    url: wss://api.eu.residency.elevenlabs.io/
    protocol: wss
  Production India:
    url: wss://api.in.residency.elevenlabs.io/
    protocol: wss
components:
  schemas:
    output_format:
      type: string
      enum:
        - value: mp3_22050_32
        - value: mp3_44100_32
        - value: mp3_44100_64
        - value: mp3_44100_96
        - value: mp3_44100_128
        - value: mp3_44100_192
        - value: pcm_8000
        - value: pcm_16000
        - value: pcm_22050
        - value: pcm_24000
        - value: pcm_44100
        - value: ulaw_8000
        - value: alaw_8000
        - value: opus_48000_32
        - value: opus_48000_64
        - value: opus_48000_96
        - value: opus_48000_128
        - value: opus_48000_192
    apply_text_normalization:
      type: string
      enum:
        - value: auto
        - value: 'on'
        - value: 'off'
    NormalizedAlignment:
      type: object
      properties:
        charStartTimesMs:
          type: array
          items:
            type: integer
        charDurationsMs:
          type: array
          items:
            type: integer
        chars:
          type: array
          items:
            type: string
    Alignment:
      type: object
      properties:
        charStartTimesMs:
          type: array
          items:
            type: integer
        charDurationsMs:
          type: array
          items:
            type: integer
        chars:
          type: array
          items:
            type: string
    AudioOutput:
      type: object
      properties:
        audio:
          type: string
        normalizedAlignment:
          $ref: '#/components/schemas/NormalizedAlignment'
        alignment:
          $ref: '#/components/schemas/Alignment'
      required:
        - audio
    FinalOutput:
      type: object
      properties:
        isFinal:
          type: string
          enum:
            - type: booleanLiteral
              value: true
    V1TextToSpeechVoiceIdStreamInputSubscribe:
      oneOf:
        - $ref: '#/components/schemas/AudioOutput'
        - $ref: '#/components/schemas/FinalOutput'
    RealtimeVoiceSettings:
      type: object
      properties:
        stability:
          type: number
          format: double
        similarity_boost:
          type: number
          format: double
        style:
          type: number
          format: double
        use_speaker_boost:
          type: boolean
        speed:
          type: number
          format: double
    GenerationConfig:
      type: object
      properties:
        chunk_length_schedule:
          type: array
          items:
            type: number
            format: double
    PronunciationDictionaryLocator:
      type: object
      properties:
        pronunciation_dictionary_id:
          type: string
        version_id:
          type: string
      required:
        - pronunciation_dictionary_id
        - version_id
    InitializeConnection:
      type: object
      properties:
        text:
          type: string
          enum:
            - type: stringLiteral
              value: ' '
        voice_settings:
          $ref: '#/components/schemas/RealtimeVoiceSettings'
        generation_config:
          $ref: '#/components/schemas/GenerationConfig'
        pronunciation_dictionary_locators:
          type: array
          items:
            $ref: '#/components/schemas/PronunciationDictionaryLocator'
        xi-api-key:
          type: string
        authorization:
          type: string
      required:
        - text
    SendText:
      type: object
      properties:
        text:
          type: string
        try_trigger_generation:
          type: boolean
        voice_settings:
          $ref: '#/components/schemas/RealtimeVoiceSettings'
        generator_config:
          $ref: '#/components/schemas/GenerationConfig'
        flush:
          type: boolean
      required:
        - text
    CloseConnection:
      type: object
      properties:
        text:
          type: string
          enum:
            - type: stringLiteral
              value: ''
      required:
        - text
    V1TextToSpeechVoiceIdStreamInputPublish:
      oneOf:
        - $ref: '#/components/schemas/InitializeConnection'
        - $ref: '#/components/schemas/SendText'
        - $ref: '#/components/schemas/CloseConnection'

```