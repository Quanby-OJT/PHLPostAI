# Channels (CHN-2)

The `channels` table is the source of channel availability and configuration.
Channel settings are JSONB so the current PostgreSQL-backed database can be
connected to Supabase later without tying channel behavior to a Supabase SDK.
No Supabase project URL or key is needed for local CHN-2 development.

## Managing channels

Users with `channels.channels.manage` can open `/channels` to enable or disable
a channel, change its allowed website origins, and update its welcome text.
Updates are applied to the database immediately and append an audit entry with
the old and new values. Public widget routes read the enabled flag and origins
on each request; a disabled widget returns an unavailable response and cannot
start a session or conversation.

## Adding an adapter

Implement `ChannelAdapter` in `apps/backend/src/modules/v1/channels/`. It
provides a stable `code`, declared `capabilities`, a `receive` method that
normalizes an inbound payload to `ChannelMessage`, and a `send` method that
formats an outbound result. Register one instance in the application's
`ChannelAdapterRegistry` during module setup. Tests may register a fake adapter
in a local registry to prove a new transport uses the same normalized message
path; do not register that fake adapter in application providers.

The web widget uses `WebWidgetChannelAdapter`. New adapters should have their
own transport and registration while reusing the shared conversation and chat
services. Building Messenger, Viber, or SMS transports is outside CHN-2.
