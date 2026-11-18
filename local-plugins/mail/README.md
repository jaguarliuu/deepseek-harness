# Intranet mail

English | [中文](README.zh.md)

The mail plugin checks one POP3 mailbox from the Desktop Host. Small C waves and shows the new message count. The first successful check establishes the baseline without announcing existing mail. Pending notices survive Host restarts and wait for an available pet. The plugin leaves messages on the server.

## Connect a mailbox

Open **Settings → Mail** in Desktop. Enter your receiving login, password or app password, and company POP3 server. The port defaults to 995. Test connection checks the current form. Save mailbox validates the settings and starts checking for new mail. Enable sending from chat to configure SMTP. Enter a private certificate authority under Company certificate. AI search and reading start disabled.

Settings are kept in DSH credentials. Leaving a password blank keeps the saved value for the same server and login. Enter the password again after changing the server address, port, login, encryption or CA.

## Deployment configuration

Install the tarball from Desktop. To build it from source, run `npm ci --ignore-scripts --prefix local-plugins/mail` and then `npm pack --ignore-scripts ./local-plugins/mail`. Existing profile YAML supplies the account when the settings page first opens. After you save in Settings, Desktop uses the saved account.

```yaml
- id: intranet-mail
  name: '@intranet/dsh-mail'
  disabled: false
  config:
    stateDirectory: /absolute/path/to/private/mail-data
    locale: zh
    pollIntervalMs: 60000
    allowModelRead: false
    pop3:
      host: pop.example.internal
      port: 995
      username: employee@example.internal
      credential: INTRANET_MAIL_POP3_PASSWORD
    smtp:
      host: smtp.example.internal
      port: 587
      security: starttls
      username: employee@example.internal
      credential: INTRANET_MAIL_SMTP_PASSWORD
      from: employee@example.internal
```

Set `locale: en` for English reminders and command feedback. Store the named values in DSH credentials or the Host environment. POP3 uses implicit TLS and requires `UIDL`. SMTP supports `tls` and `starttls` with authentication. For a private certificate authority, set the endpoint's `ca` to the PEM certificate. Omit `smtp` for receive-only use. `timeoutMs`, `headersPerPoll`, `maxListingBytes` and `maxMessageBytes` bound connection time, indexing work and downloads.

Run `/mail-test` in chat to verify POP3 login, UIDL and configured SMTP authentication. Run `/mail-status` to see monitoring state and the pending reminder count. Desktop must be running and able to reach the mailbox. After reconnecting, the plugin detects the messages still available from POP3.

## Model experience

Set `allowModelRead: true` when the configured model and Session retention policy permit processing internal mail. The Host indexes subject, sender and date in batches. `mail_search` reports indexed dates and coverage and `mail_read` fetches bounded plain text for summarization or drafting. A message removed from POP3 can retain an index entry while its body is unavailable. The local index contains mail headers and UIDLs. Mail returned to the model enters the Session log as tool output.

With SMTP configured, ask the assistant to prepare a plain-text email and send it to one recipient. Approval shows the sender, recipient, subject and body before the Host submits. An accepted submission means the SMTP server accepted it for delivery. If the outcome is unknown, check delivery with the recipient or administrator before retrying.

## Verify locally

Run `node --test local-plugins/mail/mail.test.mjs` with Node 24 and OpenSSL to exercise local TLS POP3 and SMTP fixtures.
