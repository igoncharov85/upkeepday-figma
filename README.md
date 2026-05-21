# OpenAPI Mini Viewer Figma Widget

Renders compact Swagger/OpenAPI endpoint cards as a Figma widget.

## Development

```sh
npm install
npm run build
```

Then import `manifest.json` in Figma through **Widgets > Development > Import widget from manifest...**.

## Usage

Insert the widget to open configuration automatically, or use **Configure** from the widget controls or property menu later and enter:

- Swagger/OpenAPI JSON URL, for example `https://api.upkeepday.com/swagger.json`
- Method: `GET`, `POST`, `PUT`, or `DELETE`
- Path, for example `/student/todos/action`

Click **Load** to fetch the Swagger/OpenAPI file and search available actions by path, method, operation id, tag, summary, or description. Selecting a result fills the Method and Path fields; direct manual entry still works.

After a successful generate or refresh, the widget saves only the Swagger URL for the next inserted widget. Method and Path are prefilled only when local Figma variables `ApiAction` and `ApiPath` are defined and non-empty.

The widget renders the endpoint header, request body example, and `200` response example. It does not call the API endpoint itself, and the displayed content is edited through widget configuration rather than ordinary editable Figma layers.

## Refreshing

The widget stores its Swagger URL, method, and path in synced state. Refresh it with:

- The visible **Refresh** control on the widget.
- The widget property menu **Refresh** action.

## Checks

```sh
npm run test
npm run check
npm run build
```
