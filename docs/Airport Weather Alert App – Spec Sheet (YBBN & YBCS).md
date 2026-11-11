# Airport Weather Alert App – Spec Sheet (YBBN & YBCS)

Nov 4, 2026 · @Tom

> **Update (Nov 11, 2026):** Gold Coast (YBCG / OOL) has been added as a third airport, and the dashboard's Both view has been removed in favour of one tab per airport. See the README for the current behaviour.

## Purpose & scope

This app gives ground handlers at Brisbane (YBBN) and Cairns (YBCS) one Power Apps screen showing current and forecast weather, and pushes alerts when conditions threaten ramp operations.

|  | Brisbane | Cairns |
| --- | --- | --- |
| ICAO / IATA | YBBN / BNE | YBCS / CNS |
| Reference point (lat, lon) | -27.384, 153.118 | -16.886, 145.755 |
| Local time | AEST, UTC+10 (no daylight saving) | AEST, UTC+10 (no daylight saving) |
| Main weather drivers | Summer thunderstorms, squall lines, fog, strong winds | Wet-season rain, thunderstorms, tropical cyclones, crosswinds |

**In scope**

- Live conditions and forecasts for both airports (official METAR and TAF only with the paid upgrade)
- Rule-based alerts with severity levels and acknowledgement
- A ground handler dashboard on desktop and tablet
- Alert history for post-event review

**Out of scope**

- Flight dispatch or go/no-go decisions; the app is decision support only
- Replacing official ATC, airport operator or airline weather advice
- Additional airports (design allows adding them later by config, not code)

## Users & use cases

Four roles use the app, and each needs a different slice of the same data. Ramp staff use tablets and phones; office staff use desktops.

| Role | What they need | Typical action |
| --- | --- | --- |
| Ramp / ground handler | Is it safe to work outside right now? Lightning, wind, heavy rain | Stop or resume ramp tasks when told |
| Ramp supervisor | Active alerts, time since last strike, forecast clearing time | Acknowledge alert, call stand-down or all-clear |
| Load controller | Wind, temperature, TAF trends affecting departures and turnarounds | Brief crews and flag likely delays |
| Duty manager | Both airports side by side, alert history | Resource decisions, post-event review |

**Core use cases**

1. A thunderstorm cell approaches YBBN: the app raises a Warning, the supervisor acknowledges, and the dashboard shows a stand-down banner.
2. Conditions clear: the app shows a countdown to all-clear and notifies the same group.
3. A cyclone watch is issued for far north Queensland: the app raises a Watch for YBCS and keeps it pinned until cancelled.
4. After an event, the duty manager reviews which alerts fired, who acknowledged, and how long each took.

## Weather data sources

A zero-cost build is possible, but it cannot read official METAR or TAF reports. Standard Power Automate connectors (included with Microsoft 365) can reach MSN Weather and RSS feeds, while any call to a weather web API needs the premium HTTP action ([licensing guide](https://nordflux.de/en/guides/power-automate-in-microsoft-365-whats-included-and-where-the-premium-trap-begins)).

**Free sources (decided: build on these first)**

| Need | Free source | How the flow reads it | Limits |
| --- | --- | --- | --- |
| Wind, gust, visibility, weather codes, temperature, dew point, pressure | [MSN Weather connector](https://learn.microsoft.com/en-us/connectors/msnweather/), queried by each airport's lat/lon | Standard connector, Get current weather and forecast actions | 8 calls per minute per connection; not an official aviation observation |
| Severe thunderstorm, severe weather and cyclone warnings | BoM Queensland warnings RSS feed (IDZ00056) | [RSS connector](https://learn.microsoft.com/connectors/rss), List all RSS feed items action on a 5 min schedule | The RSS trigger itself only polls every 30 min, so use the list action instead |
| Lightning stand-down | Brisbane Airport's storm lights and alerts ([storm guidance as reported](https://aerocorner.com/news/brisbane-airport-lightning-western-runway-damage/)) | Supervisor sets the status in the app; if the airport emails alerts, an Outlook shared-mailbox trigger reads them | No strike data; Cairns owner to confirm |
| Radar | BoM radar images for Brisbane and Cairns | Shown in a Power Apps image control by URL, no flow needed | Display only, no alerting |
| Storage | SharePoint lists | Standard connector | Replaces Dataverse, which is premium |

**What costs money, if you want it**

| Option | What it adds | Cost |
| --- | --- | --- |
| Free build (above) | Live conditions, BoM warnings, lightning status, alerts, dashboard | $0 with your existing Microsoft 365 licences |
| 1 Power Automate Premium licence for the account that owns the flows | Official METAR, SPECI and TAF from [aviationweather.gov](https://aviationweather.gov/data/api/) (the data itself is free) | US$15 per user per month on annual billing ([pricing](https://www.softr.io/blog/power-automate-pricing)), about A$24 in Australia ([AU guide](https://team400.ai/blog/2026-05-power-automate-licensing-australia-buyer-guide)) |
| BoM Registered User Services | Licensed official BoM feeds for commercial use | Quote from BoM only |
| Commercial lightning network (for example Vaisala or Xweather) | Strike-by-strike distances for automatic stand-down | Quote only |

**Licence caveat:** BoM's free products may be used within your organisation but not for any commercial purpose ([BoM terms](https://www.bom.gov.au/catalogue/anon-ftp.shtml)). Menzies is a commercial operator, so ask your manager or legal team whether internal safety use is covered before go-live.

## Alert rules & thresholds

Alerts fire from a rule list in SharePoint, so thresholds can be changed by an admin without editing the app. The values below are proposed defaults only and must be aligned with your company's ground handling procedures and the airport operator's rules before go-live.

| Alert | Trigger | Level | Source |
| --- | --- | --- | --- |
| Lightning alert | Brisbane Airport white storm lights on: storm activity within 10 NM | Watch | Airport alert or supervisor |
| Lightning stand-down | Brisbane Airport blue storm lights on: activity within 5 NM, all staff leave the tarmac | Stand-down | Airport alert or supervisor |
| Lightning all-clear | Airport clears the blue lights | Info | Airport alert or supervisor |
| Thunderstorm warning | BoM severe thunderstorm warning naming Brisbane or Cairns areas, or MSN weather code contains TS | Warning | BoM RSS, MSN Weather |
| Wind gust | Gust 25 kt or more; 35 kt or more; 45 kt or more | Watch; Warning; Stand-down | MSN Weather |
| Door and equipment wind limit | Current wind or gust exceeds the lowest door or equipment limit of aircraft types on the ground (see table below) | Warning | MSN Weather + AircraftLimit list |
| Visibility | 5,000 m or less; 800 m or less | Watch; Warning | MSN Weather |
| Heat | Apparent temperature 35 C or more; 38 C or more | Watch; Warning | MSN Weather |
| UV exposure | UV index 3 or more: full sun protection (shirt, SPF50+ sunscreen, hat, shade, sunglasses); 8 or more (very high); 11 or more (extreme). Bands follow ARPANSA and Cancer Council guidance | Info; Watch; Warning | MSN Weather (UV Index) |
| Tropical cyclone | Any BoM cyclone advice or warning for the Queensland coast near the airport | Watch; Warning | BoM RSS |
| Data stale (system) | MSN reading older than 30 min, or 3 failed runs in a row | Info | FeedLog |

**Aircraft wind limits (replaces the crosswind rule)**

Crosswind limits are a flight-crew matter; on the ramp the binding limits are door and equipment wind limits, which come from each type's manufacturer manual. Menzies handles Qantas at both Brisbane and Cairns ([Menzies](https://menziesaviation.com/?p=8461)) and international carriers at Brisbane, such as Air Canada (B787) and EVA Air (A330) ([2016 announcement](https://www.airport-suppliers.com/iwas_supp_press/two-new-contracts-announced-menzies-brisbane/)); these press releases are dated, so confirm the current customer list locally.

| Aircraft type | Cargo door limit (kt) | Passenger door limit (kt) | Source |
| --- | --- | --- | --- |
| A320 family | 40 (50 if nose into wind or door on the leeward side); close before 65 | 65 | [A320 limitations](https://www.theairlinepilots.com/forumarchive/a320/a320-limitations.pdf) |
| B737 | To confirm from Boeing or airline ground ops manual | To confirm |  |
| A330 | To confirm | To confirm |  |
| B787 | To confirm | To confirm |  |
| Turboprops (for example Q400) | To confirm | To confirm |  |

The limits sit in an AircraftLimit SharePoint list, so the load control lead can fill and update them without changing the app.

**Severity levels**

- **Info:** awareness only, no action required
- **Watch:** conditions may develop; supervisors prepare
- **Warning:** conditions present; supervisor must acknowledge within a set time
- **Stand-down:** ramp activity is to stop until all-clear; escalates if not acknowledged

**Behaviour rules**

- One active alert per airport and rule; repeat triggers update it instead of creating duplicates
- Alerts clear automatically only after conditions stay below threshold for a set hold time, to avoid flapping
- Runway headings, thresholds and hold times live in a config table per airport
- Alerts are advisory: the app never replaces the supervisor's judgement or official stand-down instructions

## Architecture in Power Apps

A canvas app shows the data, while scheduled Power Automate flows do all the fetching, rule checking and notifying. A canvas app (not model-driven) gives full control of the dashboard layout on tablets.

&#91;embedded content: architecture · 5 layers\]

Flows write to SharePoint lists, and the app and alerts only read the result. The app refreshes with a timer control every 60 s, and supervisors acknowledge alerts from the app or from the Teams card.

**Licensing**

- Decided: standard connectors only, at no extra cost. Storage is SharePoint lists, data comes from MSN Weather and the BoM RSS feed, and alerts go out through Teams and Outlook.
- Upgrade path: one Power Automate Premium licence on the flow owner adds an HTTP flow for official METAR and TAF; nothing else in the design changes.
- Use a dedicated service account or connection for the flows, so they keep running when staff change roles.

## Data model

Eight SharePoint lists hold everything; Dataverse is not used because it needs a premium licence.

| Table | Key fields | Purpose |
| --- | --- | --- |
| Airport | ICAO, name, lat, lon, runway headings, time zone, active flag | One row per airport; add rows to add airports |
| Observation | Airport, issue time (UTC), raw METAR, wind dir, wind speed, gust, visibility, weather codes, cloud layers, temp, dew point, QNH | Latest and recent observations, kept 30 days |
| Forecast | Airport, issue time, valid from and to, raw TAF or TTF, parsed period rows | Forecast periods for the next 24 h |
| Warning | Source product, type, area, issue time, expiry, text, status | BoM warnings and advisories |
| AlertRule | Airport, rule type, thresholds per level, hold time, notify group, enabled | Editable thresholds (see Alert rules) |
| Alert | Airport, rule, level, status, start, end, trigger value, acknowledged by and at | Live and historical alerts |
| FeedLog | Source, run time, result, records read, error text | Data age and health on the dashboard |
| AircraftLimit | Aircraft type, cargo door limit, passenger door limit, equipment limits, source manual | Wind limits used by the door and equipment rule |

**Notes**

- Store all times in UTC and convert to AEST only on screen
- Keep raw report text next to each parsed field so users can check the decode
- Access control uses SharePoint permission groups: Viewer, Supervisor (can acknowledge), Admin (can edit rules and limits)

## Dashboard specification

The dashboard shows the go or stop picture first and the supporting detail second, so a handler can read it in seconds on a tablet.

&#91;embedded content: dashboard layout · tablet landscape\]

The screen reads top to bottom: airport tabs and data age, alert banner, current conditions, forecast strip, feed health.

| Tile | Shows | Data from |
| --- | --- | --- |
| Wind | Direction, speed, gust, crosswind component per runway, trend against the last report | Observation, AlertRule |
| Lightning | Distance to nearest strike, time since last strike, stand-down or all-clear countdown | Lightning feed or supervisor entry |
| Active alerts | Live alerts with level, start time, acknowledge button and acknowledger | Alert |
| Visibility and cloud | Visibility, weather codes such as TS, RA, FG, cloud base and cover | Observation |
| Temperature and pressure | Temperature, dew point, apparent temperature, UV index with sun protection band, QNH | Observation |
| Radar | BoM radar loop for the airport area | BoM radar product |
| Forecast strip | Today and tomorrow from MSN Weather, with active BoM warnings and wind risks marked (TAF only with the paid upgrade) | Forecast |
| Feed health | Last fetch time and status per source, stale-data warning | FeedLog |

**Behaviour**

- Tabs switch between YBBN, YBCS and YBCG, one airport at a time (the original Both view was removed)
- Each tile border takes the colour and icon of the highest active level for that measure
- Tapping a tile opens the raw METAR or TAF next to its decoded values
- Three screens: Dashboard, Alerts (live list plus filterable history), Admin (rules, notify groups, runway data)
- The alert banner stays pinned above the tiles until the alert is cleared

## Notifications & escalation

Every alert shows in the app, and higher levels also go out through Microsoft Teams and phone push so supervisors see them away from a screen.

| Level | In-app banner | Teams message | Mobile push | Email | Acknowledge |
| --- | --- | --- | --- | --- | --- |
| Info | Yes (quiet) | No | No | No | No |
| Watch | Yes | Yes, to airport channel | No | No | No |
| Warning | Yes | Yes, with Acknowledge button | Yes, to supervisors | Yes, summary | Yes |
| Stand-down | Yes, full-width red banner | Yes, with Acknowledge button | Yes, to all on-shift roles | Yes, to duty manager | Yes |

**Escalation (proposed timings)**

1. Warning not acknowledged in 5 min: resend to supervisors
2. Still not acknowledged in 10 min: notify the duty manager
3. Stand-down not acknowledged in 3 min: resend and notify the duty manager immediately

**Rules**

- Recipients come from a per-airport on-shift group, so night and day teams get the right alerts
- The all-clear goes to the same people and channels as the original alert
- SMS is optional and needs a premium connector or an email-to-SMS gateway; treat it as phase 2
- Teams and Outlook actions are standard connectors; mobile push comes through the Teams mobile app on staff phones and tablets, so no premium connector is needed

## Non-functional requirements

The app must stay trustworthy at a glance: users should always know how old the data is and whether the feeds are healthy.

| Area | Target (proposed) |
| --- | --- |
| Data freshness | New MSN reading or BoM warning picked up within 5 min |
| Dashboard refresh | Auto-refresh every 60 s; first load under 5 s on a tablet |
| Availability | 24/7; a failed feed shows a red stale-data banner and alerts an admin |
| Devices | Tablets and phones on the ramp (Power Apps mobile app), desktop browser in the office; alerts via Teams |
| Sign-in and access | Microsoft Entra ID, three roles (Viewer, Supervisor, Admin) |
| Audit | Alert start, end, acknowledger and time kept 12 months |
| Time display | UTC and AEST shown together, AEST has no daylight saving |
| Readability | High contrast for outdoor use; level shown by icon and word, never colour alone |
| Disclaimer | Permanent footer: advisory only, follow official ATC, airport and company instructions |
| Data governance | Check BoM licence terms and your organisation's data loss prevention policy before connecting feeds |

## Build plan & phases

Build in four phases, and do not start the next one until its gate is passed; licensing comes first because it decides what can be built at all.

&#91;embedded content: build plan · 4 phases, 3 gates\]

Phases end on gates, not dates. Add dates and effort once the licence and data-source questions are answered, because both change the scope.

- Phase 1 can start now and needs no build work
- The NOAA feed lets Phase 2 begin before BoM access is in place
- The pilot runs alongside the current process, so supervisors keep their existing weather checks until the thresholds are proven

## Power Automate implementation plan

Five cloud flows, all on standard connectors, run the whole system at no extra cost. The dashboard reads MSN Weather directly inside Power Apps for live values, so the flows only need to run for alerting and history.

**1. Set up (once)**

- [ ] Create a service account with a Microsoft 365 licence to own every flow and connection, so flows survive staff changes
- [ ] Create a SharePoint site, Ramp Weather, with the eight lists from the Data model, plus Viewer, Supervisor and Admin groups
- [ ] Load the Airport list: YBBN (-27.384, 153.118) and YBCS (-16.886, 145.755), with runway headings and Teams channel IDs
- [ ] Load AlertRule with the thresholds from Alert rules, and AircraftLimit with the confirmed door limits
- [ ] Create a Teams team with YBBN Ramp and YBCS Ramp channels, and a shared mailbox for airport lightning alerts
- [ ] Put all flows and the app in one Power Platform solution so they move together from test to live

**2. The flows**

| Flow | Trigger | Main steps | Connectors |
| --- | --- | --- | --- |
| F1 Weather cycle | Recurrence, every 10 min | For each active airport: MSN Get current weather by "lat,lon" in Metric; convert km/h to kt; compare against AlertRule and AircraftLimit; create, update or clear Alert rows only when the level changes; write a FeedLog row | Schedule, MSN Weather, SharePoint |
| F2 BoM warnings | Recurrence, every 10 min | RSS List all RSS feed items on the BoM Queensland warnings feed; filter to thunderstorm, severe weather and cyclone items mentioning each airport's area; skip items already in Warning; create Warning and Alert rows | Schedule, RSS, SharePoint |
| F3 Lightning intake | Outlook: new email in the shared mailbox from the airport; Power Apps (V2): supervisor taps Set lightning status | Read the level (alert, stand-down, all-clear) from the subject or the button; create or close the lightning Alert | Office 365 Outlook, Power Apps, SharePoint |
| F4 Notify and acknowledge | SharePoint: Alert item created or modified | Switch on level; Watch posts to the airport channel; Warning and Stand-down post an adaptive card with an Acknowledge button and wait; write acknowledged by and time back to the Alert | SharePoint, Microsoft Teams, Office 365 Outlook |
| F5 Escalation and health | Recurrence, every 5 min | Find unacknowledged Warnings older than 5 min and Stand-downs older than 3 min, re-post and email the duty manager; if the latest FeedLog row is over 30 min old, alert the admin | Schedule, SharePoint, Teams, Outlook |

**3. Key expressions**

```
Gust (kt):        mul(body('Get_current_weather')?['responses']?['weather']?['current']?['windGust'], 0.54)
Thunderstorm:     contains(string(body('Get_current_weather')?['responses']?['weather']?['current']?['wx']), 'TS')
Visibility (m):   mul(body('Get_current_weather')?['responses']?['weather']?['current']?['vis'], 1000)
Location string:  concat(items('For_each_airport')?['Lat'], ',', items('For_each_airport')?['Lon'])
```

Check these paths against a test run's output first; connector outputs can differ slightly from the documentation.

UV uses the connector's UV Index field directly (no conversion); it reads 0 overnight, so the UV alert clears itself each evening. UV bands source: [Cancer Council / ARPANSA](https://www.cancer.org.au/assets/pdf/cancer-council-stresses-importance-of-improved-understanding-as-uv-reaches-extreme-levels-this-summer).

**4. Action budget**

A Microsoft 365 licence allows about 6,000 flow actions per user per day, and every action inside a loop counts. Estimates for the service account:

| Flow | Runs per day | Actions per run (approx.) | Actions per day |
| --- | --- | --- | --- |
| F1 Weather cycle | 144 | 20 | 2,880 |
| F2 BoM warnings | 144 | 6 | 864 |
| F5 Escalation and health | 288 | 3 | 864 |
| F3 and F4 (event driven) | about 20 | 10 | 200 |
| **Total** |  |  | **about 4,800** |

This leaves little room, so keep F1 at 10 minutes, write rows only on change, and watch the flow analytics in the first week. If the budget runs out, move F5 to every 10 minutes before touching F1.

**5. Build order**

1. Lists and service account, then F1 for YBBN only, writing to FeedLog
2. Dashboard screen reading MSN Weather and SharePoint, tested on a tablet and a phone
3. F2 and F3, then F4 with the Teams adaptive card
4. F5, then add YBCS by adding its Airport row
5. Shadow run beside current procedures, then go-live

**6. Testing**

- Lower a threshold in AlertRule (for example gust 5 kt) to force an alert, then restore it
- Send a test email to the shared mailbox to check lightning intake and the Teams card
- Leave an alert unacknowledged to prove escalation reaches the duty manager
- Turn off F1 for 35 min to prove the stale-data banner and admin alert

## Risks, assumptions & open questions

The biggest risk is data quality: the free build relies on MSN Weather, which is not an official aviation source, and on Brisbane Airport's lightning alerts reaching the app.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| MSN Weather is not an official aviation observation | Readings can differ from the airport METAR | Label values as indicative; link to the BoM aviation site; Premium upgrade adds official METAR and TAF |
| Lightning alerts from Brisbane Airport do not reach the app automatically | A stand-down could be missed in the app | Ask the airport whether its alerts can go to a shared mailbox; supervisor entry button meanwhile; the airport's storm lights always take priority |
| BoM licence does not cover commercial use | Feed could breach terms | Confirm internal-use position with management before go-live |
| Thresholds or wind limits differ from airline and Menzies procedures | Alerts mislead or get ignored | Workshop with the safety lead and load control lead; fill the AircraftLimit list from manuals |
| Users rely on the app instead of official advice | Safety incident | Permanent disclaimer, data-age display, stale-feed banner |
| Free feeds change or stop without notice | Silent data gaps | FeedLog health checks and admin alerts |
| Standard limits (6,000 actions per user per day, 8 MSN calls per minute) | Flows throttled or paused | Poll every 5 min, keep flows lean; see the action budget in the implementation plan |

**Assumptions**

- Your organisation uses Microsoft Teams and Entra ID sign-in
- Alerts are advisory and supervisors keep final authority
- Two airports at launch, more added by configuration

**Open questions**

- Licence: standard Power Automate only, no paid add-ons (decided)
- Lightning procedure: owned by Brisbane Airport (decided); who owns it at Cairns, and can either airport send alerts by email?
- Aircraft: which types does Menzies currently handle at each airport, and what are their door and equipment wind limits?
- Devices: tablets and phones on the ramp, desktops in the office (decided); do all ramp staff have Microsoft 365 accounts with Teams and Power Apps?
- Is internal safety use of free BoM feeds acceptable to management?
