# Get transcript

GET https://api.elevenlabs.io/v1/speech-to-text/transcripts/{transcription_id}

Retrieve a previously generated transcript by its ID.

Reference: https://elevenlabs.io/docs/api-reference/speech-to-text/get

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Get Transcript By Id
  version: endpoint_speechToText/transcripts.get
paths:
  /v1/speech-to-text/transcripts/{transcription_id}:
    get:
      operationId: get
      summary: Get Transcript By Id
      description: Retrieve a previously generated transcript by its ID.
      tags:
        - - subpackage_speechToText
          - subpackage_speechToText/transcripts
      parameters:
        - name: transcription_id
          in: path
          description: The unique ID of the transcript to retrieve
          required: true
          schema:
            type: string
        - name: xi-api-key
          in: header
          required: true
          schema:
            type: string
      responses:
        '200':
          description: The transcript data
          content:
            application/json:
              schema:
                $ref: >-
                  #/components/schemas/speech_to_text_transcripts_get_Response_200
        '422':
          description: Validation Error
          content: {}
components:
  schemas:
    SpeechToTextWordResponseModelType:
      type: string
      enum:
        - value: word
        - value: spacing
        - value: audio_event
    SpeechToTextCharacterResponseModel:
      type: object
      properties:
        text:
          type: string
        start:
          type:
            - number
            - 'null'
          format: double
        end:
          type:
            - number
            - 'null'
          format: double
      required:
        - text
    SpeechToTextWordResponseModel:
      type: object
      properties:
        text:
          type: string
        start:
          type:
            - number
            - 'null'
          format: double
        end:
          type:
            - number
            - 'null'
          format: double
        type:
          $ref: '#/components/schemas/SpeechToTextWordResponseModelType'
        speaker_id:
          type:
            - string
            - 'null'
        logprob:
          type: number
          format: double
        characters:
          type:
            - array
            - 'null'
          items:
            $ref: '#/components/schemas/SpeechToTextCharacterResponseModel'
      required:
        - text
        - type
        - logprob
    AdditionalFormatResponseModel:
      type: object
      properties:
        requested_format:
          type: string
        file_extension:
          type: string
        content_type:
          type: string
        is_base64_encoded:
          type: boolean
        content:
          type: string
      required:
        - requested_format
        - file_extension
        - content_type
        - is_base64_encoded
        - content
    SpeechToTextChunkResponseModel:
      type: object
      properties:
        language_code:
          type: string
        language_probability:
          type: number
          format: double
        text:
          type: string
        words:
          type: array
          items:
            $ref: '#/components/schemas/SpeechToTextWordResponseModel'
        channel_index:
          type:
            - integer
            - 'null'
        additional_formats:
          type:
            - array
            - 'null'
          items:
            oneOf:
              - $ref: '#/components/schemas/AdditionalFormatResponseModel'
              - type: 'null'
        transcription_id:
          type:
            - string
            - 'null'
      required:
        - language_code
        - language_probability
        - text
        - words
    MultichannelSpeechToTextResponseModel:
      type: object
      properties:
        transcripts:
          type: array
          items:
            $ref: '#/components/schemas/SpeechToTextChunkResponseModel'
        transcription_id:
          type:
            - string
            - 'null'
      required:
        - transcripts
    speech_to_text_transcripts_get_Response_200:
      oneOf:
        - $ref: '#/components/schemas/SpeechToTextChunkResponseModel'
        - $ref: '#/components/schemas/MultichannelSpeechToTextResponseModel'
        - $ref: '#/components/schemas/SpeechToTextChunkResponseModel'
        - $ref: '#/components/schemas/MultichannelSpeechToTextResponseModel'

```

## SDK Code Examples

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

async function main() {
    const client = new ElevenLabsClient({
        environment: "https://api.elevenlabs.io",
    });
    await client.speechToText.transcripts.get("transcription_id");
}
main();

```

```python
from elevenlabs import ElevenLabs

client = ElevenLabs(
    base_url="https://api.elevenlabs.io"
)

client.speech_to_text.transcripts.get(
    transcription_id="transcription_id"
)

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription_id"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("xi-api-key", "xi-api-key")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(res)
	fmt.Println(string(body))

}
```

```ruby
require 'uri'
require 'net/http'

url = URI("https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription_id")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["xi-api-key"] = 'xi-api-key'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription_id")
  .header("xi-api-key", "xi-api-key")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription_id', [
  'headers' => [
    'xi-api-key' => 'xi-api-key',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription_id");
var request = new RestRequest(Method.GET);
request.AddHeader("xi-api-key", "xi-api-key");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["xi-api-key": "xi-api-key"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription_id")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "GET"
request.allHTTPHeaderFields = headers

let session = URLSession.shared
let dataTask = session.dataTask(with: request as URLRequest, completionHandler: { (data, response, error) -> Void in
  if (error != nil) {
    print(error as Any)
  } else {
    let httpResponse = response as? HTTPURLResponse
    print(httpResponse)
  }
})

dataTask.resume()
```