# Route V2 Image Coverage Backfill Audit

Generated: 2026-08-11T05:00:00.000Z

## Outcome

- Historical image debt discovered: 183
- Country graphic covers added: 38
- Verified destination City images: 0
- Batch 05 local Country graphic covers added: 20
- Dedicated City image coverage: 0/306 (0%)
- City neutral placeholders: 306
- Verified Core POI image coverage: 0/105 (0%)
- POI neutral placeholders: 105
- Active invalid mappings: 0
- Needs backfill: 411
- Runtime external image requests: disabled

Country resources are explicitly classified as non-photographic entity label cards. They make no landmark or destination-photo claim. Generated City/POI label cards are not counted as dedicated imagery; until a source and rights-verified destination image exists, every City/POI uses the shared neutral placeholder.

## Debt by country and priority

Priority is deterministic: each country's three highest-depth published Cities are high, other Cities with at least five published POIs are normal, and lower-depth Cities are low. Core POI debt inherits high priority.

| Code | Country | Scope | High City | Normal City | Low City | Core POI | Total |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| AT | Austria | Historical | 3 | 3 | 2 | 3 | 11 |
| AU | Australia | Historical | 2 | 0 | 0 | 2 | 4 |
| BE | Belgium | Batch 05 | 3 | 3 | 1 | 3 | 10 |
| CA | Canada | Batch 05 | 3 | 7 | 0 | 3 | 13 |
| CH | Switzerland | Historical | 2 | 0 | 0 | 2 | 4 |
| CO | Colombia | Historical | 2 | 0 | 0 | 2 | 4 |
| CZ | Czechia | Batch 05 | 3 | 4 | 0 | 3 | 10 |
| DE | Germany | Historical | 3 | 7 | 2 | 3 | 15 |
| DK | Denmark | Batch 05 | 3 | 3 | 1 | 3 | 10 |
| ES | Spain | Historical | 3 | 9 | 1 | 3 | 16 |
| FI | Finland | Batch 05 | 3 | 4 | 0 | 3 | 10 |
| FR | France | Historical | 3 | 6 | 4 | 3 | 16 |
| GB | United Kingdom | Batch 05 | 3 | 10 | 2 | 3 | 18 |
| GR | Greece | Historical | 3 | 4 | 2 | 3 | 12 |
| HR | Croatia | Batch 05 | 3 | 3 | 2 | 3 | 11 |
| HU | Hungary | Batch 05 | 3 | 3 | 1 | 3 | 10 |
| ID | Indonesia | Batch 05 | 3 | 6 | 0 | 3 | 12 |
| IE | Ireland | Batch 05 | 3 | 5 | 1 | 3 | 12 |
| IS | Iceland | Historical | 2 | 0 | 0 | 2 | 4 |
| IT | Italy | Historical | 3 | 10 | 0 | 3 | 16 |
| JP | Japan | Historical | 3 | 13 | 6 | 3 | 25 |
| KR | South Korea | Historical | 3 | 2 | 8 | 3 | 16 |
| MX | Mexico | Batch 05 | 3 | 6 | 0 | 3 | 12 |
| MY | Malaysia | Batch 05 | 3 | 4 | 0 | 3 | 10 |
| NL | Netherlands | Historical | 3 | 6 | 1 | 3 | 13 |
| NO | Norway | Batch 05 | 3 | 4 | 1 | 3 | 11 |
| NZ | New Zealand | Historical | 2 | 0 | 0 | 2 | 4 |
| PE | Peru | Batch 05 | 3 | 3 | 1 | 3 | 10 |
| PH | Philippines | Batch 05 | 3 | 3 | 1 | 3 | 10 |
| PL | Poland | Batch 05 | 3 | 5 | 0 | 3 | 11 |
| PT | Portugal | Historical | 3 | 7 | 0 | 3 | 13 |
| SE | Sweden | Batch 05 | 3 | 4 | 0 | 3 | 10 |
| SG | Singapore | Historical | 1 | 0 | 0 | 1 | 2 |
| SI | Slovenia | Batch 05 | 3 | 2 | 1 | 3 | 9 |
| TH | Thailand | Historical | 2 | 0 | 0 | 2 | 4 |
| TR | Turkey | Historical | 2 | 0 | 0 | 2 | 4 |
| US | United States of America | Batch 05 | 3 | 11 | 0 | 3 | 17 |
| VN | Vietnam | Batch 05 | 3 | 4 | 2 | 3 | 12 |

## Remaining City backfill

- AT · high · Vienna · city-456578ab24d451ff
- AT · high · Graz · city-e2930ffae37e9bb6
- AT · high · Innsbruck · city-6d8bfa998b2fe3e1
- AT · normal · Salzburg · city-0699df842d819ca4
- AT · normal · Bregenz · city-3f52e95430ac83e2
- AT · normal · Linz · city-60983c289d9ce9d3
- AT · low · Hallstatt · city-85e356e0e514f090
- AT · low · Zell am See · city-c8106459287724ff
- AU · high · Melbourne · city-e91b5be401efc35d
- AU · high · Sydney · city-64a359ba87706a72
- BE · high · Brussels · city-c1934ae62a95f59e
- BE · high · Antwerp · city-2379d38efd7a0d92
- BE · high · Bruges · city-7fa1315cc6058d08
- BE · normal · Ghent · city-567aca625098d09b
- BE · normal · Leuven · city-8896853114ec6d46
- BE · normal · Liège · city-39b17ae0551d2929
- BE · low · Dinant · city-b8f568d203bce192
- CA · high · Montreal · city-41ced49048f1d971
- CA · high · Toronto · city-0634eba240864940
- CA · high · Vancouver · city-e28f1e57abe5d071
- CA · normal · Calgary · city-caac7e9129b49c1a
- CA · normal · Ottawa · city-ebab6142ff8d73f7
- CA · normal · Quebec City · city-7d4280aac6b5016a
- CA · normal · Victoria · city-5c6be2bb844c746b
- CA · normal · Banff · city-d029e97d08ae18b0
- CA · normal · Halifax · city-ace4fa6b86e141a0
- CA · normal · Jasper · city-c6d2534bcb1a2557
- CH · high · Lucerne · city-6424297f5bfd77b8
- CH · high · Zürich · city-8dfe7b39752eceb2
- CO · high · Bogotá · city-9250707178588c35
- CO · high · Medellín · city-5766a6c5c46b184b
- CZ · high · Prague · city-2c83bc499c1c4889
- CZ · high · Brno · city-498e80bf490697fd
- CZ · high · Český Krumlov · city-c39223c2cd05297f
- CZ · normal · Karlovy Vary · city-ebbbc5dfc5b2cb0c
- CZ · normal · Kutná Hora · city-a58978ee641f9081
- CZ · normal · Olomouc · city-64fc6d3de2c9948d
- CZ · normal · Plzeň · city-9255a28fe4d7f19b
- DE · high · Berlin · city-92d9ceba1c4a056d
- DE · high · Munich · city-6dd5cc0f5d9b27be
- DE · high · Cologne · city-4c0072d93c40af15
- DE · normal · Dresden · city-9191f5c8ad23559d
- DE · normal · Frankfurt · city-eb3b0543a44c1a6a
- DE · normal · Hamburg · city-35d40ad856b5217d
- DE · normal · Nuremberg · city-486403ae2fe80a8e
- DE · normal · Heidelberg · city-04043a41b9e40b7c
- DE · normal · Leipzig · city-b0c1c518937f5849
- DE · normal · Stuttgart · city-cb1036743b005670
- DE · low · Füssen · city-0e2167f7aa866944
- DE · low · Rothenburg ob der Tauber · city-cc58ce9627425138
- DK · high · Copenhagen · city-de64a21a71e5cbce
- DK · high · Aarhus · city-3ddab7f670e90afa
- DK · high · Odense · city-5828c678a083189d
- DK · normal · Aalborg · city-f02ab28c44007d48
- DK · normal · Helsingør · city-de47ecdaa72970d3
- DK · normal · Roskilde · city-a95e8eb6e438477c
- DK · low · Ribe · city-9ecfbe14bb1d7923
- ES · high · Barcelona · city-6e97dec8890873f7
- ES · high · Madrid · city-f833a342bb5b925a
- ES · high · Bilbao · city-13465734fe974589
- ES · normal · Córdoba · city-b58a1f56e1537c03
- ES · normal · Granada · city-283e3d48eecca2f3
- ES · normal · Seville · city-8ee23d7f47e3d887
- ES · normal · Valencia · city-b5bbb6cb608fb43d
- ES · normal · Málaga · city-4e3642962d726a6c
- ES · normal · Salamanca · city-3a8e93bbd8ea3695
- ES · normal · San Sebastián · city-6a7dac50969d1f2d
- ES · normal · Santiago de Compostela · city-7cc50855c97464fe
- ES · normal · Toledo · city-8430a47b14ffd429
- ES · low · Ronda · city-5098b736342d402d
- FI · high · Helsinki · city-f8fd54cc84a22fd5
- FI · high · Turku · city-51d172b9e24e3620
- FI · high · Rovaniemi · city-429a3933fcf72f52
- FI · normal · Tampere · city-999501a1081be244
- FI · normal · Kuopio · city-9160fdd17b9c562f
- FI · normal · Oulu · city-d85e4f336213d064
- FI · normal · Porvoo · city-1169803b507f0a75
- FR · high · Paris · city-32da4cad2757df97
- FR · high · Bordeaux · city-367a0dbc6e8792b6
- FR · high · Lyon · city-5bba0fc2f52dc8df
- FR · normal · Marseille · city-60de7be23c539c87
- FR · normal · Nice · city-d224602f49c126a0
- FR · normal · Strasbourg · city-c88b8e0a78d41f2a
- FR · normal · Aix-en-Provence · city-ced7cb4a11f9e3e9
- FR · normal · Avignon · city-4a6737e5c37fcb6b
- FR · normal · Toulouse · city-f3b90177b0da59bf
- FR · low · Annecy · city-62c57792a6bd2f46
- FR · low · Cannes · city-c370066a6f8d9a36
- FR · low · Chamonix · city-3b93b2804c63706e
- FR · low · Colmar · city-f366b4cb18028d85
- GB · high · London · city-eba7cc78f607d814
- GB · high · Belfast · city-a5c13de09b454c1c
- GB · high · Cardiff · city-921e6278451dd6d8
- GB · normal · Edinburgh · city-65b1aca3904788fe
- GB · normal · Glasgow · city-4a330ecde03b4bcf
- GB · normal · Manchester · city-c14ea9275d560480
- GB · normal · Bath · city-53617dc1a4e72d29
- GB · normal · Brighton · city-3f4f26f63b098928
- GB · normal · Bristol · city-28b5dc0644526a55
- GB · normal · Cambridge · city-86cc244c0a5a7aa5
- GB · normal · Liverpool · city-e301917587abb680
- GB · normal · Oxford · city-1e3c0261578026a0
- GB · normal · York · city-ee28d5dc14fd9967
- GB · low · Canterbury · city-13d4b2991a591819
- GB · low · Inverness · city-0c5f16f24966ecc1
- GR · high · Athens · city-2c0cedec09cfd089
- GR · high · Chania · city-50bab3faba488ced
- GR · high · Corfu Town · city-8b50df8117d56136
- GR · normal · Heraklion · city-1ae2bf785c1f74bc
- GR · normal · Rhodes Town · city-771fa7d75414482c
- GR · normal · Thessaloniki · city-adda424dbaf38725
- GR · normal · Nafplio · city-074db4d4b49a85e5
- GR · low · Delphi · city-6e4ba9ec0c2f0f00
- GR · low · Kalabaka · city-d325ab7cc4450e38
- HR · high · Zagreb · city-776c07b74e9ee818
- HR · high · Dubrovnik · city-7cacd1fb1304df51
- HR · high · Split · city-f8acfc46483ac5f3
- HR · normal · Zadar · city-7f0fbcf9789cca06
- HR · normal · Pula · city-1046a89f4d07b594
- HR · normal · Šibenik · city-59f6e6f56d6ec3ae
- HR · low · Rovinj · city-7f2ac96ad1cf93fc
- HR · low · Trogir · city-872844e43bef302a
- HU · high · Budapest · city-918ca6909e031908
- HU · high · Debrecen · city-d3ff5daf8ed68e18
- HU · high · Pécs · city-d8feb521dfebb139
- HU · normal · Szeged · city-44edb4b5caecb65d
- HU · normal · Eger · city-aad4a016af406593
- HU · normal · Győr · city-bb280f8f5762e9c8
- HU · low · Szentendre · city-d9d86d455b0e5f3e
- ID · high · Jakarta · city-25008f3980057dc6
- ID · high · Bandung · city-e1be65f85ec6dcba
- ID · high · Surabaya · city-2919c25138c3d0fd
- ID · normal · Ubud · city-982451e3a3c530d0
- ID · normal · Yogyakarta · city-4f860ef96fedbd1f
- ID · normal · Denpasar · city-3bea25263e94af5b
- ID · normal · Makassar · city-389d19c84f2f9c30
- ID · normal · Malang · city-4ffdffdd0f029f7f
- ID · normal · Semarang · city-9cf52ce619057b10
- IE · high · Dublin · city-e6665ba2dee556d1
- IE · high · Cork · city-6ddc11780af61808
- IE · high · Galway · city-63dfc636699e6461
- IE · normal · Kilkenny · city-2c224d4669e71336
- IE · normal · Killarney · city-4fd91a8d8db74fad
- IE · normal · Limerick · city-44730a29a4a100b2
- IE · normal · Sligo · city-97da6efeb487bb2e
- IE · normal · Waterford · city-645bbf4e680a7ba6
- IE · low · Doolin · city-8b979679b5fbbdd3
- IS · high · Reykjavík · city-ec5f6eb44af88c19
- IS · high · Vík í Mýrdal · city-922253e414d069f3
- IT · high · Rome · city-133b155bac966dfa
- IT · high · Florence · city-d40570b2aac4850d
- IT · high · Milan · city-c2ce5de4c930921c
- IT · normal · Naples · city-f4ab4ac7c8c65aac
- IT · normal · Palermo · city-e8f0c07a3b186851
- IT · normal · Venice · city-c85060ff1bf40bda
- IT · normal · Bologna · city-c35a51f0cb5d2021
- IT · normal · Catania · city-42fa7d7ec2a164f4
- IT · normal · Como · city-df3c42866a11edba
- IT · normal · Pisa · city-164dd28088aa25f4
- IT · normal · Siena · city-b83b9960445cd188
- IT · normal · Turin · city-0a37bf91d42410d6
- IT · normal · Verona · city-66bc37ecc403b7eb
- JP · high · Kyoto · city-8acaf08893e5abf1
- JP · high · Tokyo · city-5a21732f861ff7f1
- JP · high · Osaka · city-bb2b8072fca1d274
- JP · normal · Nagoya · city-f17cb016449ab40e
- JP · normal · Nara · city-8e7ea972d32813e9
- JP · normal · Fukuoka · city-11aadb65744f16c8
- JP · normal · Hiroshima · city-684cf7eb16759f74
- JP · normal · Sapporo · city-45d08342ab6298be
- JP · normal · Hatsukaichi · city-47c9ca41467ed3e5
- JP · normal · Kamakura · city-130a47f528e210f3
- JP · normal · Kobe · city-f94e894e88837154
- JP · normal · Hakodate · city-8604e98af5a0bf75
- JP · normal · Hakone · city-963a6186abb8bb90
- JP · normal · Kanazawa · city-7b76928f557485f6
- JP · normal · Kumamoto · city-e4c829354d7edc8a
- JP · normal · Naha · city-a537532044875bb1
- JP · low · Fujikawaguchiko · city-2e866e33dbb9ed15
- JP · low · Takayama · city-9eb941dc4cc899ef
- JP · low · Beppu · city-2a35c76c6ffed88a
- JP · low · Okinawa City · city-52661544a7a4388d
- JP · low · Otaru · city-b584cab6bd222b8d
- JP · low · Yufuin (Yufu) · city-ec98c79ca52bdb7f
- KR · high · Seoul · city-f485961843960f06
- KR · high · Busan · city-6fdc557c860230e3
- KR · high · Gyeongju · city-d886736d18965d48
- KR · normal · Jeju City · city-b2e7474b951f723e
- KR · normal · Incheon · city-b747cf52e4bc20f6
- KR · low · Daegu · city-955b93bc3404f668
- KR · low · Yeosu · city-f204bf635ee5ea16
- KR · low · Andong · city-6456f3aa5d07ca1e
- KR · low · Gangneung · city-f97862dc82774ea9
- KR · low · Jeonju · city-f6091553326ae92e
- KR · low · Sokcho · city-8e4cd3ee52eca954
- KR · low · Suwon · city-adcc5add2dc37dc8
- KR · low · Tongyeong · city-db8501edb4e1335d
- MX · high · Mexico City · city-18ed579b1bfe2d8d
- MX · high · Cancún · city-7d67be5cb83e1485
- MX · high · Guadalajara · city-258a16d7e3a6b561
- MX · normal · Mérida · city-2bb58506d297fedd
- MX · normal · Oaxaca · city-809769d6e4ea12e0
- MX · normal · Puebla · city-d8821f411fd0711e
- MX · normal · Guanajuato · city-bf2e678a44a19bc6
- MX · normal · Playa del Carmen · city-9e1481413119dfc3
- MX · normal · San Miguel de Allende · city-df4112a82a2b4519
- MY · high · Kuala Lumpur · city-0075bb1293b44dbc
- MY · high · George Town · city-a12f0a59f07b75f1
- MY · high · Kota Kinabalu · city-b0f38f4d2ec1fbf4
- MY · normal · Kuching · city-50645031fe7e62a5
- MY · normal · Malacca City · city-bc20c9d6ca2573f9
- MY · normal · Ipoh · city-b8ae7d31fb5cfd18
- MY · normal · Johor Bahru · city-8b438984cffef51f
- NL · high · Amsterdam · city-66a343aed16e37a4
- NL · high · Rotterdam · city-bf507de627cbfc1e
- NL · high · The Hague · city-e05bc954475d4069
- NL · normal · Utrecht · city-48c618f238f3263d
- NL · normal · Delft · city-e9334e2f8591e78c
- NL · normal · Groningen · city-eda8b459459267a5
- NL · normal · Haarlem · city-4e037309f993aff4
- NL · normal · Leiden · city-32ccd44f6e63dcb9
- NL · normal · Maastricht · city-42d1de1ad3362df7
- NL · low · Giethoorn · city-e9def10b7a0cdea7
- NO · high · Oslo · city-25addacaf4743504
- NO · high · Bergen · city-9a09aa14302ec54f
- NO · high · Tromsø · city-f2256a3b9b503d5d
- NO · normal · Trondheim · city-709539223e144546
- NO · normal · Ålesund · city-3feffb92e64ea397
- NO · normal · Bodø · city-5540afe0ce541593
- NO · normal · Stavanger · city-e446cff2b1de8c7c
- NO · low · Lillehammer · city-e296c5f0e95d5bb3
- NZ · high · Auckland · city-08c9530e89597cdf
- NZ · high · Queenstown · city-2cb3e8890c6c7848
- PE · high · Cusco · city-65c7e5ade4f64098
- PE · high · Lima · city-54e3b945011b3295
- PE · high · Arequipa · city-c53e89efdcd37dfe
- PE · normal · Huaraz · city-70016b1a4282de88
- PE · normal · Puno · city-b063448da22824fd
- PE · normal · Trujillo · city-30dca9649cefe803
- PE · low · Ica · city-20f11e603aef8ebd
- PH · high · Manila · city-004791374256954d
- PH · high · Cebu City · city-2de17a2bc6043fc0
- PH · high · Davao City · city-e21ca783f3d984fc
- PH · normal · Baguio · city-604193e42a5d9f31
- PH · normal · Iloilo City · city-251735e9e17b600f
- PH · normal · Vigan · city-6dbca898f0d17e6d
- PH · low · Puerto Princesa · city-7b2cab1ae5a4c63e
- PL · high · Warsaw · city-83414d1ae1a11ef2
- PL · high · Kraków · city-7c5e7e54c0cc73d4
- PL · high · Gdańsk · city-e9ddfb5c811a7673
- PL · normal · Poznań · city-3d736d05d7e11912
- PL · normal · Wrocław · city-7835c8c3eafec695
- PL · normal · Lublin · city-46d5c7517db93e4a
- PL · normal · Toruń · city-f4462cd2a1212e8c
- PL · normal · Zakopane · city-c08bc01a26eed6dd
- PT · high · Lisbon · city-0b698dc2d0543b0e
- PT · high · Coimbra · city-3afec41980a016c2
- PT · high · Porto · city-6f31bde299eab111
- PT · normal · Sintra · city-4258f12373d3c348
- PT · normal · Aveiro · city-abdd80683790dc81
- PT · normal · Braga · city-ed958a6d1d2dcc7d
- PT · normal · Évora · city-5bf2ba95e40c608e
- PT · normal · Faro · city-c159dcf369a61f40
- PT · normal · Guimarães · city-e522715ce542e2ca
- PT · normal · Lagos · city-23e4523c57c5ac2a
- SE · high · Stockholm · city-7a0950c424e1282d
- SE · high · Gothenburg · city-b84d2c11f89fa4c2
- SE · high · Malmö · city-6e7b3c3b9490e8b9
- SE · normal · Kiruna · city-db7a96547625c19f
- SE · normal · Lund · city-cf01417966fb6e7b
- SE · normal · Uppsala · city-a94b312a4103b0da
- SE · normal · Visby · city-5f291da6070af599
- SG · high · Singapore · city-dde074f983b42cfd
- SI · high · Ljubljana · city-47ea9a0b8d57fa76
- SI · high · Bled · city-ddb9df8e3b769e04
- SI · high · Maribor · city-acb0423f7fa0d7e7
- SI · normal · Koper · city-157aa18beb222874
- SI · normal · Piran · city-662396baf7e7346e
- SI · low · Kranjska Gora · city-2d710f6259cc1454
- TH · high · Bangkok · city-102fbf49ef872866
- TH · high · Chiang Mai · city-dde5b708a62ae273
- TR · high · Ankara · city-d6f6bf7d2fca5cb4
- TR · high · Istanbul · city-fc91a9c6c7b389cf
- US · high · Chicago · city-9c500879d4604b46
- US · high · Los Angeles · city-acc77da3ec924a7d
- US · high · New York City · city-1b035830a43bec55
- US · normal · San Francisco · city-3ebb5f1726c3ac6a
- US · normal · Washington, D.C. · city-e1aeb0472fea9f6c
- US · normal · Boston · city-e9c5ca89d86c9b06
- US · normal · Denver · city-461119780811d24f
- US · normal · Honolulu · city-872e81620b136129
- US · normal · Las Vegas · city-e4701b3935371283
- US · normal · Miami · city-8a3ead331f5d086c
- US · normal · New Orleans · city-58e0b68e36021c6f
- US · normal · Orlando · city-c26220d9c7fd85c9
- US · normal · San Diego · city-07c243032c44b063
- US · normal · Seattle · city-38b11835f3b6e0cb
- VN · high · Hanoi · city-c5b9642fac1b070a
- VN · high · Ho Chi Minh City · city-e321c6d35c4b62da
- VN · high · Da Nang · city-3534e10ea2259139
- VN · normal · Huế · city-6f7577d16778bfce
- VN · normal · Da Lat · city-1489fedbf28c09fd
- VN · normal · Hội An · city-185e6e1e3f131407
- VN · normal · Nha Trang · city-6c2fe9a829ecf2d5
- VN · low · Haiphong · city-e431d604e55c2218
- VN · low · Cần Thơ · city-58c9dc2086482e5b

## Remaining Core POI backfill

- AT · high · Albertina · poi-e8eab5517892ad6e
- AT · high · Eggenberg Palace · poi-ccf6f66f438d0d5d
- AT · high · Alpine Zoo Innsbruck · poi-a545ba786d11a469
- AU · high · Melbourne Museum · poi-69de0ee7fc58e11d
- AU · high · Royal Botanic Garden, Sydney · poi-c117087ce07a1d3e
- BE · high · Bourse Palace · poi-518bea221a0be78c
- BE · high · Antwerp City Hall · poi-5e1ec61554ca98d4
- BE · high · Belfry of Bruges · poi-b5f780790c07acfa
- CA · high · Church of St. Andrew and St. Paul · poi-3f518c09904aa8a8
- CA · high · Bloor Street · poi-8f0269ebd51e4343
- CA · high · City of Vancouver Archives · poi-02472e59fd8ba8ba
- CH · high · Chapel Bridge · poi-67ff3980626e150c
- CH · high · Grossmünster · poi-4cef4d841745bcc3
- CO · high · Bogotá Primatial Cathedral · poi-ddc7b7bdd1f9dc2d
- CO · high · Medellín Museum of Modern Art · poi-cc15b69a5d3397c6
- CZ · high · Bethlehem Chapel · poi-74c4f69929e1f918
- CZ · high · AZ Tower · poi-4db44bb328b578d9
- CZ · high · Český Krumlov Castle · poi-0417f69e4ad93a24
- DE · high · Alexanderplatz · poi-c35ac75d524146a5
- DE · high · Allianz Arena · poi-c186033602d1c87d
- DE · high · Cologne Cathedral · poi-7d626e4e649f46a7
- DK · high · Caritas Well · poi-b9e7939120e97cb5
- DK · high · Aarhus Cathedral · poi-5c7f510bfab708c8
- DK · high · Funen · poi-9e7e7bd7605c1ca6
- ES · high · Arc de Triomf · poi-4c9d59b1f473da9c
- ES · high · Almudena Cathedral · poi-e1af6231a8050bae
- ES · high · Azkuna Zentroa · poi-225ba7fb8ec2c420
- FI · high · Ateneum · poi-578c1e1c46b6eec6
- FI · high · Åbo Svenska Teater · poi-cc8db649938bade8
- FI · high · Arktikum Science Museum · poi-6cb487c8ce2df6f9
- FR · high · Arc de Triomphe · poi-6a213882cc769c49
- FR · high · Basilica of Saint Michael · poi-44b0234d65db147d
- FR · high · Basilica of Notre-Dame de Fourvière · poi-b6b05705097c6bb1
- GB · high · Admiralty Arch · poi-dfb1960f420454cf
- GB · high · Albert Memorial Clock · poi-9355e26f3258af59
- GB · high · Cardiff Arms Park · poi-832167259be358ab
- GR · high · Acropolis Museum · poi-0e3c2f85eac6bbb7
- GR · high · Archaeological Museum of Chania · poi-ce0a372babdb1ad5
- GR · high · Archaeological Museum of Corfu · poi-2affed51932097bd
- HR · high · Archaeological Museum of Zagreb · poi-8f85e9f971a61d2f
- HR · high · Dubrovnik Cathedral · poi-2c2aec6cf59867a3
- HR · high · Cathedral of Saint Domnius · poi-feb613ff95927a0c
- HU · high · Buda Castle · poi-93041eee37e48a52
- HU · high · Csokonai Theatre · poi-a44d5b64595f3bd0
- HU · high · Gandhi School · poi-46e6a5ac919ec7dd
- ID · high · Cut Mutiah Mosque · poi-246c5f4cbdc650aa
- ID · high · Bandung Cathedral · poi-6552faff8a5c3578
- ID · high · Ampel Mosque · poi-988e10280ee01879
- IE · high · Abbey Street · poi-ee0c64d215256bbd
- IE · high · Cathedral of St Mary and St Anne · poi-1d6ee221366e33fd
- IE · high · An Taibhdhearc - Amharclann Náisiúnta na Gaeilge · poi-06da0eb3d5e340ea
- IS · high · Hallgrímskirkja · poi-2db70d54ff4779a2
- IS · high · Reynisdrangar · poi-11552d7158b391bd
- IT · high · Baths of Caracalla · poi-3c7a296248f45e88
- IT · high · Basilica of Santa Croce · poi-1f03bd299a2a68e5
- IT · high · Basilica of Sant'Ambrogio · poi-99ca42e432383064
- JP · high · Arashiyama · poi-704b6c18972d5d8f
- JP · high · Akihabara · poi-0f686b97b037b62d
- JP · high · Abeno Harukas · poi-205373acb3f61851
- KR · high · Bongeunsa · poi-9dbad9683856c82b
- KR · high · Beomeosa · poi-8b5e85f2115504cc
- KR · high · Bulguksa · poi-cc64bdc058f4268f
- MX · high · Alberca Olímpica Francisco Márquez · poi-dda2188a94d1ba0d
- MX · high · Andrés Quintana Roo Olympic Stadium · poi-267d2a426a2ab742
- MX · high · Guadalajara Cathedral · poi-05bd98bd1b4f0a1b
- MY · high · Bursa Malaysia · poi-06518918251ff66b
- MY · high · Cheong Fatt Tze Mansion · poi-5a22795b93727e42
- MY · high · Atkinson Clock Tower · poi-b49dffbc230fb82c
- NL · high · Amsterdam Museum · poi-75281c04e1ab27ca
- NL · high · Cube Houses · poi-1fc98c7d3d0e3a5c
- NL · high · Binnenhof · poi-c8ab11f7d24339ba
- NO · high · Christiania Theatre · poi-5f75f1ebc5e63513
- NO · high · Bergen Cathedral · poi-0d54abefe1ec72da
- NO · high · Arctic Cathedral · poi-7931d7714510f76c
- NZ · high · Auckland Art Gallery · poi-450306ed5bfc7913
- NZ · high · Lake Wakatipu · poi-0eb1228d4c6fbdb9
- PE · high · Church of the Society of Jesus · poi-83aea39ff88db267
- PE · high · Basílica María Auxiliadora · poi-8380fdaf565ed6f0
- PE · high · Arequipa Peru Temple · poi-8302f74ba1bc1d76
- PH · high · Binondo Church · poi-db3cddc3bb5b1c49
- PH · high · Cebu City Philippines Temple · poi-502780932afb589c
- PH · high · Abreeza · poi-1be3a9362f98e12e
- PL · high · Aleje Jerozolimskie · poi-6d8ebdf4180d8fed
- PL · high · Altarpiece of Veit Stoss in Kraków · poi-ff9bbc748643c5d1
- PL · high · European Solidarity Centre · poi-116abcdd3a621451
- PT · high · Belém Tower · poi-6e51dc6255515fca
- PT · high · Biblioteca Joanina · poi-6f1c660d80318e8b
- PT · high · Church of São Francisco · poi-977c43c698e8c372
- SE · high · Drottninggatan · poi-f8dde456e2b39d3b
- SE · high · Gamla Ullevi · poi-714068f9ec7005f0
- SE · high · Eleda Stadion · poi-b94e6d06cb37b1af
- SG · high · Gardens by the Bay · poi-893318c8ec655c93
- SI · high · Arch. Plečnik's Marketplace · poi-9c318a43e0dce3fb
- SI · high · Ajdna · poi-73853ceaf4bbb254
- SI · high · Basilica of Our Mother of Mercy · poi-67c84ea5b6649d46
- TH · high · Grand Palace · poi-a173f1d1fa02521f
- TH · high · Wat Chedi Luang · poi-dcd7f51accdfb88a
- TR · high · Anıtkabir · poi-85f5ccba3f115856
- TR · high · Hagia Sophia · poi-9a98993feb59f773
- US · high · Chase Tower · poi-dc9f3bd9027ba1eb
- US · high · Bradbury Building · poi-16cc50a0b2e2f1dc
- US · high · 30 Park Place · poi-2f453a160b61d8c2
- VN · high · Ba Ðình Square · poi-10058d148f5cf5f4
- VN · high · Bến Thành Market · poi-57520887c364aaf8
- VN · high · Chi Lang Stadium · poi-ecb7c8076e72b54b
