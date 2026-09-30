# Test the app on your phone with the Thermapen ONE Blue

You need three things:

- The Thermapen ONE Blue.
- An Android phone with Chrome, or an iPhone with the free Bluefy browser from the App Store. Safari and Chrome on iPhone have no Web Bluetooth.
- The app running at an `https://` address the phone can reach. Web Bluetooth only works on secure pages (`https://`, or `http://localhost`).

Pick one of the three ways below to get the app onto the phone, then follow [Connect the Thermapen](#connect-the-thermapen-one-blue).

## Option 1: GitHub Codespaces (nothing to install)

1. On GitHub, open the repository and switch to the branch `claude/awesome-faraday-4djtnb`.
2. Press **Code**, open the **Codespaces** tab and choose **Create codespace on claude/awesome-faraday-4djtnb**.
3. Wait for setup. The first time takes a few minutes: it installs, builds and starts the app on port 3000 with a demo estate.
4. Open the **Ports** tab at the bottom. Port 3000 is labelled "Legionella Dossier". Copy its forwarded address. It looks like `https://<name>-3000.app.github.dev`.
5. Open that address in Chrome on the phone. The port is private by default, so GitHub asks you to sign in first. Sign in with the same GitHub account.

If signing in on the phone is awkward, right-click the port and set **Port visibility** to **Public** for the test. Anyone with the address can then open the app, so keep to the demo data and set it back to private, or stop the codespace, when you finish.

A codespace stops by itself after a period of inactivity. Restarting it restarts the app.

## Option 2: Laptop and Android over USB (stays on your machine)

Needs Node 22.13 or later and pnpm 10 on the laptop.

```bash
pnpm install
pnpm build
pnpm start
```

1. On the phone, open **Settings > About phone** and tap **Build number** 7 times to turn on developer options. Then turn on **Developer options > USB debugging**.
2. Plug the phone into the laptop and accept the **Allow USB debugging** prompt.
3. On the laptop, open Chrome at `chrome://inspect/#devices`, press **Port forwarding**, add port `3000` to `localhost:3000` and tick **Enable port forwarding**.
4. On the phone, open Chrome at `http://localhost:3000`.

Localhost counts as a secure page, so Bluetooth works without a certificate.

## Option 3: Laptop and a temporary HTTPS tunnel (also works for iPhone)

With the app running as in option 2 and [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed:

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints an `https://…trycloudflare.com` address to open on the phone. Anyone with that address can reach the app, so use the demo data only and stop the tunnel with Ctrl+C when you finish.

## Connect the Thermapen ONE Blue

1. Unfold the probe. It switches on.
2. Do not pair it in the phone's Bluetooth settings. Close ThermaData Hub, the ThermoWorks app or anything else that might be connected to it. The probe accepts one connection at a time.
3. On Android, turn Bluetooth on. When Chrome asks for **Nearby devices** (or **Location** on older Android), allow it.
4. In the app, open **Probe** and press **Connect Bluetooth probe**. Pick the Thermapen and press **Pair**.
5. The live temperature shows on the Probe page and in the top bar. The Bluetooth symbol shows on the probe display.
6. Press **MEASURE/TRANSFER** on the probe. The Probe page should say "1 press received".
7. Look at **Readings every**. If it shows more than 1 s, press **Set 1-second readings**. Timed runs need about one reading a second.

Checks worth doing on the first connection:

| Check | Expected |
| --- | --- |
| Reading on the phone against the probe display | Same value, within 0.1 °C |
| Probe button | Each press shows up on the Probe page |
| Identify probe | The probe signals, so you know which one is connected |
| Model, firmware, battery | Filled in (some firmware does not report all three) |

## Run a task with the probe

1. Open **Tasks** and pick a **Hot sentinel outlet temperature** task.
2. Type your name once. The phone keeps it.
3. Hold the probe tip in the stream, press the probe button (or **Start run**) and turn the tap on.
4. The card runs the clock, marks the second the water reaches 50 °C (55 °C on healthcare sites) and records the reading once the temperature settles. Press the probe button again to record straight away.
5. Press **Complete task**.

The phone screen stays on during a run so Bluetooth does not drop.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "This browser does not expose Web Bluetooth" | Use Chrome on Android or Bluefy on iPhone, and check the address starts with `https://` or `http://localhost`. |
| The Thermapen is not in the list | Unfold the probe, close other apps that use it, then press **Show all nearby Bluetooth devices**. Turning phone Bluetooth off and on also helps. |
| Connected, but no temperature | Open **Diagnostics** on the Probe page, press **Copy diagnostics** and send the text to whoever maintains the app. It lists every Bluetooth frame. |
| Readings arrive every few seconds | Press **Set 1-second readings** on the Probe page. |
| "GATT operation failed" | Press **Disconnect**, fold and unfold the probe, then connect again. |
| The connection drops between tasks | Reconnect from the Probe page. Chrome remembers the probe. |

## Not supported yet

The ONE Blue's enhanced display (task name and limits on the probe screen) needs ThermoWorks' newer protocol document, which ThermoWorks gives integrators on request. Readings, the button, battery and the identify command use the existing protocol and work now.
