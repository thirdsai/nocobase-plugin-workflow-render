(Disclosure: I'm connected to thirds.ai.)
Drafted with AI help.

# Workflow: Render (thirds.ai) for NocoBase

A workflow node for NocoBase 2.x. It turns a record into a PDF or an image, saves the file into an attachment field through NocoBase file storage, and hands the file to the next nodes, so a Mailer node can send it in the same workflow.

It needs a thirds.ai account and an API key. Rendering runs on [thirds.ai](https://thirds.ai/?utm_source=github&utm_medium=listing&utm_campaign=own-content&utm_content=nocobase-workflow-render); NocoBase only builds the request and stores the result.

## Example 1: invoice PDF, saved and emailed

Trigger: "After record added" on `invoices` (fields `number`, `customer`, `email`, `amount`, `description`, and an attachment field `pdf`).

1. Add **Render PDF or image**.
   * Collection: `invoices`. Record ID: `{{$context.data.id}}`. Save to attachment field: `pdf`.
   * Source: HTML. Pick the **Invoice (PDF)** starter, or paste your own.
   * QR codes: name `pay`, value `https://example.com/pay/{{$context.data.number}}`.
   * Format: PDF, A4. File name: `invoice-{{$context.data.number}}`.
2. Add **Mailer** after it.
   * To: `{{$context.data.email}}`.
   * Attachments: choose the render node's result (the node returns the saved file record).

A new invoice row ends up with the PDF in its `pdf` field, and the customer gets the same PDF by email.

## Example 2: asset label PNG with a QR code

Trigger: "After record added" on `assets` (fields `name`, `code`, and an attachment field `label`).

1. Add **Render PDF or image**.
   * Collection: `assets`. Save to attachment field: `label`.
   * Pick the **QR label (PNG)** starter. Format: PNG, 800 by 400.
   * QR codes: name `code`, value `{{$context.data.code}}`.

Each new asset gets a printable label image with a scannable QR code in `label`.

## Install

Download the `.tgz` from the GitHub release, then run:

```bash
yarn pm add /path/to/plugin-workflow-render-0.1.0.tgz
yarn pm enable @thirdsai/plugin-workflow-render
```

Requires NocoBase 2.x with the Workflow and File manager plugins enabled (they are on by default). Tested on NocoBase 2.2.36. Uploading the `.tgz` in **Plugin manager > Add & update** is untested.

### API key

The key is read from the server environment only. Set it where NocoBase runs, for example in `.env` (kept out of git) or your container's environment:

```bash
THIRDS_API_KEY=your-key
```

Restart NocoBase after setting it. The key is never stored in the database or in the workflow config, and it is not shown in the UI. `THIRDS_API_BASE` can point the node at another API host for testing.

## Writing the layout

Write the layout as HTML in the node. You can mix two kinds of tags:

* NocoBase variables such as `{{$context.data.customer}}` are filled in by NocoBase before sending. Values are HTML escaped.
* Template tags such as `{{ record.amount }}` are filled in by thirds.ai from the data the node sends.

Using a saved thirds.ai template instead of HTML is coming in a later version.

The node sends this data:

| Key | What it holds |
| --- | --- |
| `record` | The record (all fields, or only the ones you pick) |
| `title` | `title`, `name`, `number` or `code` of the record, whichever comes first |
| `fields` | The record's plain fields as a list of `{ name, label, value }` |
| `qr` | One image per QR code you defined, as a data URI |
| anything else | Whatever you put in **Extra data** (a JSON object) |

Template tags that work:

```html
<h1>{{ title }}</h1>
<p>{{ record.customer | default('') }}</p>
<table>
{% for f in fields %}<tr><th>{{ f.label }}</th><td>{{ f.value }}</td></tr>{% endfor %}
</table>
<img src="{{ qr.pay | safe }}">
```

Tips:

* A missing value stops the render with "A required template variable is missing". Give optional fields a default: `{{ record.note | default('') }}`.
* QR images need `| safe` inside `src`, otherwise the data URI is escaped. With a NocoBase variable, `{{$qr.pay}}` works too.
* Record values are escaped, so text such as `<b>` prints as text.
* If you send HTML with no record and no QR codes, it is used as is, without template tags.

Starters that come with the node: **Invoice (PDF)** and **QR label (PNG)**. A third starter, **Record summary (PDF)**, is also included but untested.

## Output

The node's result is the saved file record (`id`, `filename`, `url`, `mimetype`, `size`, `storageId` and so on), which is what Mailer attachments and other file inputs expect. It also has:

* `thirds`: `jobId`, `format`, `bytes`, `sha256`, and `credit`.
* `target`: the collection, record ID and field the file was linked to.

Signed download links from thirds.ai are not stored anywhere.

By default the new file replaces what is in the attachment field.

## Failures

If rendering fails, the node fails with a readable message (for example a missing template variable or an empty QR code value), and the workflow execution stops there.

## Options

| Option | Notes |
| --- | --- |
| Format | PDF (A4) or PNG |
| File name | NocoBase variables allowed; the extension is added for you |
| Image size | Custom width and height |

Only the main data source is supported in this version.

### Not yet tested

The node also has these settings. They are in the code but were not part of the tests for this release, so treat them as preview:

* JPEG and WebP output, transparent backgrounds, other page sizes, margins and landscape
* adding to an attachment field instead of replacing, and creating a file with no record
* "Only these fields", and "Continue the workflow if rendering fails"
* reusing an earlier render when the same record is run again

## License

MIT
