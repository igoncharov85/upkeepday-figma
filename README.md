# OpenAPI Mini Viewer Figma Plugin

Generates compact, editable Swagger/OpenAPI endpoint cards in Figma.

## Development

```sh
npm install
npm run build
```

Then import `manifest.json` in Figma through **Plugins > Development > Import plugin from manifest...**.

## Usage

Run the plugin and enter:

- Swagger/OpenAPI JSON URL, for example `https://api.upkeepday.com/swagger.json`
- Method: `GET`, `POST`, `PUT`, or `DELETE`
- Path, for example `/student/todos/action`

Click **Load spec** to fetch the Swagger/OpenAPI file and search available actions by path, method, operation id, tag, summary, or description. Selecting a result fills the Method and Path fields; direct manual entry still works.

If local Figma string variables named `SwaggerUrl`, `ApiAction`, and `ApiPath` exist, the plugin uses them to prefill the fields when it opens.

The plugin creates native Figma layers for the endpoint header, request body example, and `200` response example. It does not call the API endpoint itself.

## Refreshing

Generated frames store their Swagger URL, method, and path. Select a generated frame and either:

- Click **Refresh selected** in the plugin UI.
- Use the Figma relaunch button **Refresh OpenAPI card** from the selected frame's properties panel.

## Checks

```sh
npm run test
npm run check
npm run build
```
