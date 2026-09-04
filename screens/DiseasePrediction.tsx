import React, { useState, useRef, useEffect } from 'react';
import { Search, ShieldAlert, CheckCircle2, RotateCcw, AlertCircle, ArrowLeft, Leaf, ChevronDown, ChevronUp } from 'lucide-react';
import { analyzePlantDisease } from '../services/geminiService';
import { firebaseAuthService } from '../services/firebaseAuth';
import { fetchProfileFromFirestore } from '../services/firestoreProfile';
import { getStoredFarmerProfile } from '../services/farmerContextService';
import { db, auth } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ==================== TYPES ====================
interface Disease {
  name: string;
  symptoms: string;
  causes: string;
  remedy: string;
  prevention: string;
}

interface Props {
  onBack: () => void;
  language: string;
  t: (key: string) => string;
}

// ==================== DISEASE DATABASE CACHE ====================
const DISEASE_CACHE_KEY = 'uzhavan_crop_diseases';
const DISEASE_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days (extended for offline)
const CAMERA_CACHE_KEY = 'uzhavan_camera_results';

function getCachedDiseases(cropName: string, lang: string): Disease[] | null {
  try {
    const raw = localStorage.getItem(`${DISEASE_CACHE_KEY}_${cropName}_${lang}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // In offline mode, allow expired cache
    if (navigator.onLine && Date.now() - parsed.timestamp > DISEASE_CACHE_EXPIRY) return null;
    return parsed.diseases;
  } catch { return null; }
}

function setCachedDiseases(cropName: string, lang: string, diseases: Disease[]) {
  try {
    localStorage.setItem(`${DISEASE_CACHE_KEY}_${cropName}_${lang}`, JSON.stringify({
      diseases,
      timestamp: Date.now()
    }));
  } catch { /* ignore storage errors */ }
}

// Cache camera analysis results
function getCachedAnalysis(key: string): string | null {
  try {
    const raw = localStorage.getItem(`${CAMERA_CACHE_KEY}_${key}`);
    if (!raw) return null;
    return JSON.parse(raw).result;
  } catch { return null; }
}

function setCachedAnalysis(key: string, result: string) {
  try {
    localStorage.setItem(`${CAMERA_CACHE_KEY}_${key}`, JSON.stringify({
      result, timestamp: Date.now()
    }));
  } catch { /* ignore */ }
}

// ==================== OFFLINE DISEASE DATABASE ====================
const OFFLINE_DISEASES: Record<string, Disease[]> = {
  rice: [
    { name: "Blast (Rice Blast)", symptoms: "Diamond-shaped spots on leaves with grey center and brown border. Neck of panicle turns brown and breaks.", causes: "Fungus Magnaporthe oryzae. Spread by wind, high humidity and excess nitrogen fertilizer.", remedy: "1. Apply Tricyclazole 75% WP at 0.6g/L\n2. Spray Carbendazim 50% WP at 1g/L\n3. Remove and burn infected plants\n4. Drain excess water from field", prevention: "Use resistant varieties (CO 51, ADT 43). Avoid excess nitrogen. Maintain proper spacing. Use seed treatment with Carbendazim." },
    { name: "Bacterial Leaf Blight", symptoms: "Yellow to white lesions along leaf veins starting from tip. Leaves dry from edges. Milky bacterial ooze in morning.", causes: "Bacterium Xanthomonas oryzae. Enters through wounds, spread by rain and wind.", remedy: "1. Spray Streptocycline 0.01% + Copper oxychloride 0.05%\n2. Drain field water\n3. Apply potash fertilizer\n4. Remove severely affected plants", prevention: "Use resistant varieties. Avoid excess nitrogen. Ensure proper drainage. Treat seeds with hot water (52°C for 30 min)." },
    { name: "Sheath Blight", symptoms: "Oval or irregular greenish-grey spots on leaf sheath near water level. Spots enlarge and merge causing leaves to dry.", causes: "Fungus Rhizoctonia solani. Favored by high temperature, humidity and dense planting.", remedy: "1. Spray Validamycin 3% SL at 2ml/L\n2. Apply Hexaconazole 5% EC at 2ml/L\n3. Reduce planting density\n4. Drain stagnant water", prevention: "Avoid dense planting. Use moderate nitrogen. Clean field of previous crop debris. Use Trichoderma in nursery." },
    { name: "Brown Spot", symptoms: "Oval brown spots on leaves with grey center. Grains become discolored. Seedlings show brown lesions.", causes: "Fungus Bipolaris oryzae. Caused by nutrient deficiency especially zinc and potassium.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply zinc sulphate 25kg/ha\n3. Apply potash fertilizer\n4. Improve soil nutrition", prevention: "Balanced fertilization with zinc and potash. Use disease-free seeds. Seed treatment with Thiram." },
    { name: "Tungro Virus", symptoms: "Stunted plants with yellow-orange discoloration. Reduced tillering. Leaves become mottled yellow.", causes: "Virus transmitted by Green Leafhopper (Nephotettix virescens).", remedy: "1. Remove infected plants immediately\n2. Spray Imidacloprid 17.8% SL at 0.5ml/L for vector control\n3. Use light traps to catch leafhoppers\n4. Apply neem oil spray", prevention: "Use resistant varieties (IR 36, CO 45). Synchronize planting. Control leafhopper population. Remove weed hosts." }
  ],
  wheat: [
    { name: "Rust (Yellow/Brown/Black)", symptoms: "Orange-yellow to brown pustules on leaves and stems. Leaves turn yellow and dry prematurely.", causes: "Fungus Puccinia species. Spread by wind-borne spores in cool, humid weather.", remedy: "1. Spray Propiconazole 25% EC at 1ml/L\n2. Apply Mancozeb 75% WP at 2.5g/L\n3. Two sprays at 15-day interval\n4. Remove volunteer wheat plants", prevention: "Grow resistant varieties (HD 2967, PBW 343). Early sowing. Avoid late nitrogen application." },
    { name: "Loose Smut", symptoms: "Ear heads turn into black powdery mass of spores. Grains replaced by smut spores.", causes: "Fungus Ustilago tritici. Seed-borne infection enters during flowering.", remedy: "1. Treat seeds with Carboxin 75% WP at 2g/kg\n2. Use Vitavax 200 for seed treatment\n3. Remove and burn infected ears before spores spread", prevention: "Always use certified, treated seeds. Hot water seed treatment at 52°C for 10 minutes." },
    { name: "Karnal Bunt", symptoms: "Partial conversion of grains into black powdery mass with fishy smell. Affects only some grains in ear.", causes: "Fungus Tilletia indica. Favored by cool, humid weather during flowering.", remedy: "1. Treat seeds with Carboxin at 2g/kg\n2. Spray Propiconazole at flowering\n3. Clean and grade grain before storage", prevention: "Use clean, certified seeds. Avoid late sowing. Deep summer ploughing." }
  ],
  cotton: [
    { name: "Bollworm", symptoms: "Holes in bolls with frass. Larvae feeding inside bolls. Shedding of squares and young bolls.", causes: "Helicoverpa armigera and other bollworm species. Peak during flowering and boll formation.", remedy: "1. Install pheromone traps (5/acre)\n2. Spray Emamectin Benzoate 5% SG at 0.4g/L\n3. Release Trichogramma wasps\n4. Hand-pick and destroy larvae", prevention: "Grow Bt cotton varieties. Trap crops with marigold. Destroy crop residue after harvest." },
    { name: "Bacterial Blight", symptoms: "Angular water-soaked spots on leaves. Black arm on stems. Boll rot with bacterial ooze.", causes: "Bacterium Xanthomonas citri pv. malvacearum. Seed-borne, spread by rain splash.", remedy: "1. Spray Streptocycline 100ppm + Copper oxychloride 0.3%\n2. Remove and burn infected plants\n3. Apply balanced fertilizer", prevention: "Use disease-free seeds. Acid delinting. Grow resistant varieties. Crop rotation." },
    { name: "Root Rot / Wilt", symptoms: "Sudden wilting of plants. Leaves turn yellow then brown. Roots show dark discoloration.", causes: "Fungus Rhizoctonia solani / Fusarium oxysporum. Soil-borne, favored by excess moisture.", remedy: "1. Drench soil with Carbendazim 1g/L\n2. Apply Trichoderma viride 2.5kg/ha\n3. Improve field drainage\n4. Remove and burn dead plants", prevention: "Crop rotation with cereals. Avoid waterlogging. Deep summer ploughing. Seed treatment with Trichoderma." }
  ],
  sugarcane: [
    { name: "Red Rot", symptoms: "Reddening of internal tissue when stalk is split. White spots in red area. Leaves dry from top.", causes: "Fungus Colletotrichum falcatum. Enters through borer holes and sett wounds.", remedy: "1. Remove and burn infected clumps\n2. Sett treatment with Carbendazim 0.1%\n3. Avoid ratoonist from infected fields\n4. Hot water treatment of setts (52°C, 30 min)", prevention: "Use disease-free setts from healthy crop. Grow resistant varieties (Co 86032, CoC 671). Avoid waterlogging." },
    { name: "Smut", symptoms: "Black whip-like structure from growing tip. Thin, grass-like tillers. Stunted growth.", causes: "Fungus Sporisorium scitamineum. Spread by wind-borne spores and infected setts.", remedy: "1. Remove and burn smut whips before spores spread\n2. Rogue out infected clumps\n3. Do not use infected field for seed crop\n4. Treat setts with Triadimefon 0.1%", prevention: "Use healthy setts. Hot air treatment. Grow resistant varieties. Avoid ratooning." },
    { name: "Grassy Shoot Disease", symptoms: "Excessive thin tillers giving grassy appearance. No cane formation. White to pale green shoots.", causes: "Phytoplasma transmitted by leafhopper vectors.", remedy: "1. Remove and burn all infected clumps\n2. Control leafhopper vectors with Imidacloprid\n3. Do not take ratoon from infected field", prevention: "Use disease-free planting material. Hot water treated setts. Roguing at regular intervals." }
  ],
  maize: [
    { name: "Fall Armyworm", symptoms: "Ragged feeding on leaves with frass. Larvae in whorl. Windowpane effect on young leaves.", causes: "Spodoptera frugiperda. Migrating pest, rapid multiplication in warm weather.", remedy: "1. Spray Emamectin Benzoate 5% SG at 0.4g/L\n2. Apply Chlorantraniliprole 18.5% SC at 0.4ml/L\n3. Pour sand + lime mixture into whorl\n4. Release Trichogramma pretiosum", prevention: "Early planting. Intercrop with pulses. Install pheromone traps. Bird perches in field." },
    { name: "Turcicum Leaf Blight", symptoms: "Long elliptical grey-green lesions on leaves. Lesions turn brown. Severe in humid weather.", causes: "Fungus Exserohilum turcicum. Spread by wind and rain splash.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply Propiconazole at 1ml/L\n3. Remove lower infected leaves\n4. Two sprays at 10-day interval", prevention: "Grow resistant hybrids. Crop rotation. Remove crop residue." },
    { name: "Downy Mildew", symptoms: "White downy growth on leaf underside. Narrow, yellow-striped leaves. Stunted plants with tassel formation in leaves.", causes: "Fungus Peronosclerospora sorghi. Spread by wind-borne spores in humid conditions.", remedy: "1. Spray Metalaxyl 35% WS as seed treatment (6g/kg)\n2. Remove and destroy infected plants\n3. Spray Mancozeb + Metalaxyl combination", prevention: "Use treated seeds. Grow resistant varieties. Avoid continuous maize cropping. Remove weed hosts." }
  ],
  tomato: [
    { name: "Late Blight", symptoms: "Dark brown water-soaked patches on leaves and fruits. White fungal growth under leaves. Rapid plant death.", causes: "Fungus Phytophthora infestans. Favored by cool, wet weather and high humidity.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply Cymoxanil + Mancozeb at 3g/L\n3. Remove infected plant parts\n4. Improve air circulation", prevention: "Use resistant varieties. Stake plants properly. Avoid overhead irrigation. Mulch around base." },
    { name: "Leaf Curl Virus", symptoms: "Upward curling and thickening of leaves. Stunted growth. Yellowing of leaves. No fruit formation.", causes: "Tomato Leaf Curl Virus transmitted by whitefly (Bemisia tabaci).", remedy: "1. Remove and destroy infected plants\n2. Spray Imidacloprid 17.8% SL at 0.5ml/L for whitefly\n3. Use yellow sticky traps\n4. Spray neem oil 2%", prevention: "Use resistant varieties (Arka Rakshak). Grow nursery under nylon net. Control whitefly. Avoid planting near infected fields." },
    { name: "Fruit Borer", symptoms: "Round holes in fruits with larva inside. Fruits rot from bore holes. Frass visible on fruit surface.", causes: "Helicoverpa armigera. Peak during fruiting stage.", remedy: "1. Install pheromone traps (5/acre)\n2. Spray Spinosad 45% SC at 0.3ml/L\n3. Spray neem seed kernel extract 5%\n4. Hand-pick and destroy affected fruits", prevention: "Intercrop with marigold. Release Trichogramma. Install bird perches. Early harvest of mature fruits." }
  ],
  chilli: [
    { name: "Anthracnose (Die Back)", symptoms: "Dark sunken spots on fruits. Tips of branches die back and dry. Concentric rings on ripe fruits.", causes: "Fungus Colletotrichum capsici. Seed-borne, spread by rain splash.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply Carbendazim 1g/L\n3. Remove infected fruits and branches\n4. Seed treatment with Thiram 3g/kg", prevention: "Use disease-free seeds. Crop rotation for 2-3 years. Avoid overhead irrigation. Good field drainage." },
    { name: "Chilli Leaf Curl", symptoms: "Curling and puckering of leaves. Deformed fruits. Stunted plant growth.", causes: "Virus transmitted by thrips and whitefly.", remedy: "1. Spray Fipronil 5% SC at 2ml/L\n2. Remove infected plants\n3. Use yellow and blue sticky traps\n4. Spray neem oil 2%", prevention: "Use virus-free seedlings. Nursery under net protection. Control vector insects early." },
    { name: "Powdery Mildew", symptoms: "White powder patches on leaves, stems and fruits. Leaves turn yellow and drop. Reduced fruit quality.", causes: "Fungus Leveillula taurica. Dry weather with cool nights and warm days.", remedy: "1. Spray Dinocap 0.1% or sulfur 0.2%\n2. Apply Hexaconazole 5% EC at 1ml/L\n3. Remove severely infected leaves", prevention: "Maintain plant spacing. Avoid excessive vegetative growth. Use resistant varieties." }
  ],
  groundnut: [
    { name: "Tikka Disease (Leaf Spot)", symptoms: "Circular brown spots on upper leaf surface. Dark border around spots. Heavy defoliation.", causes: "Fungus Cercospora arachidicola. Favored by warm humid weather.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply Chlorothalonil 75% WP at 2g/L\n3. Start spraying 30 days after sowing\n4. Repeat at 15-day interval", prevention: "Use resistant varieties. Deep ploughing after harvest. Crop rotation with cereals." },
    { name: "Stem Rot", symptoms: "Dark brown lesions at stem base near soil. White fungal growth on roots. Sudden wilting of branches.", causes: "Fungus Sclerotium rolfsii. Soil-borne, favored by high moisture and temperature.", remedy: "1. Apply Trichoderma viride 2.5kg/ha to soil\n2. Drench with Carbendazim 1g/L\n3. Remove and burn infected plants\n4. Apply gypsum 400kg/ha", prevention: "Deep summer ploughing. Seed treatment with Trichoderma. Avoid waterlogging. Crop rotation." },
    { name: "Rust", symptoms: "Small orange-brown pustules on leaf underside. Leaves turn yellow and drop. Serious yield loss.", causes: "Fungus Puccinia arachidis. Spread by wind in humid conditions.", remedy: "1. Spray Mancozeb at 2.5g/L mixed with Carbendazim at 1g/L\n2. Apply at first sign and repeat every 15 days\n3. Remove crop debris after harvest", prevention: "Early sowing. Use resistant varieties. Balanced nutrition with phosphorus and potash." }
  ],
  banana: [
    { name: "Panama Wilt (Fusarium Wilt)", symptoms: "Yellowing and splitting of outer leaf sheaths. Internal discoloration of pseudostem (reddish brown). Leaves collapse.", causes: "Fungus Fusarium oxysporum f.sp. cubense. Soil-borne, enters through roots.", remedy: "1. Remove and burn infected plants with roots\n2. Apply lime to soil (2kg per pit)\n3. Drench soil with Carbendazim 2g/L\n4. Use Trichoderma enriched compost", prevention: "Use tissue culture plants. Grow resistant varieties (Poovan, Ney Poovan). Avoid infected soil. Flood fallow for 2-3 months." },
    { name: "Sigatoka Leaf Spot", symptoms: "Yellow streaks on leaves becoming brown spots with grey center. Leaves dry prematurely. Reduced bunch weight.", causes: "Fungus Mycosphaerella musicola. Spread by wind and rain in humid conditions.", remedy: "1. Spray Propiconazole 25% EC at 1ml/L\n2. Remove and destroy affected leaves\n3. Spray Mancozeb 2.5g/L for prevention\n4. Apply at 15-day interval during monsoon", prevention: "Remove dried leaves regularly. Maintain drainage. Proper spacing. Apply potash fertilizer." },
    { name: "Bunchy Top Virus", symptoms: "Dark green streaks on leaf veins. Leaves become narrow and bunchy at top. No fruit formation.", causes: "Banana Bunchy Top Virus transmitted by aphid (Pentalonia nigronervosa).", remedy: "1. Immediately remove and destroy infected plants (bury deep or burn)\n2. Inject infected pseudostem with herbicide before removal\n3. Control aphids with Imidacloprid", prevention: "Use virus-free planting material. Regular field inspection. Control aphid vectors. Do not replant in infected area for 6 months." }
  ],
  potato: [
    { name: "Late Blight", symptoms: "Water-soaked dark patches on leaves. White fungal growth on underside. Tubers turn brown and rot.", causes: "Fungus Phytophthora infestans. Rapid in cool, wet weather.", remedy: "1. Spray Mancozeb + Metalaxyl at 2.5g/L\n2. Apply Cymoxanil-based fungicide\n3. Remove and destroy infected plants\n4. Hilling to protect tubers", prevention: "Use certified disease-free seed tubers. Plant resistant varieties (Kufri Jyoti). Proper spacing. Avoid overhead watering." },
    { name: "Early Blight", symptoms: "Concentric dark brown rings on lower leaves (target board pattern). Leaves turn yellow and drop.", causes: "Fungus Alternaria solani. Favored by warm days and cool nights.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply Chlorothalonil at 2g/L\n3. Remove infected lower leaves\n4. Spray at 10-day interval", prevention: "Crop rotation for 3 years. Use healthy seed. Balanced nutrition. Avoid water stress." },
    { name: "Black Scurf", symptoms: "Black irregular masses on tuber surface. Brown cankers on sprouts. Aerial tubers form.", causes: "Fungus Rhizoctonia solani. Present in soil and on infected tubers.", remedy: "1. Seed treatment with Boric acid 3%\n2. Apply Trichoderma to soil\n3. Plant only clean seed tubers\n4. Harvest promptly at maturity", prevention: "Use clean certified seed. Crop rotation. Deep summer ploughing. Avoid waterlogging." }
  ],
  onion: [
    { name: "Purple Blotch", symptoms: "Small water-soaked lesions on leaves turning purple-brown. Concentric rings in spots. Leaves break and dry.", causes: "Fungus Alternaria porri. Favored by warm humid weather and injured plants.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L\n2. Apply Chlorothalonil at 2g/L\n3. Spray at first symptom and repeat every 10 days\n4. Mix sticker with spray solution", prevention: "Use resistant varieties. Proper spacing. Avoid excess irrigation. Balanced fertilization." },
    { name: "Thrips Damage", symptoms: "Silver-white patches on leaves. Curling and twisting of leaf tips. Stunted growth. Tiny black insects on leaves.", causes: "Thrips tabaci. Peak in hot dry weather. Rapid multiplication.", remedy: "1. Spray Fipronil 5% SC at 2ml/L\n2. Apply Spinosad 45% SC at 0.3ml/L\n3. Use blue sticky traps\n4. Spray neem oil 2% weekly", prevention: "Intercrop with coriander. Mulch with straw. Overhead sprinkler during peak. Early planting." },
    { name: "Basal Rot", symptoms: "Yellowing and wilting from leaf tips downward. Roots rot and turn pink-white. Bulb becomes soft and watery.", causes: "Fungus Fusarium oxysporum f.sp. cepae. Soil-borne, enters through wounds.", remedy: "1. Drench with Carbendazim 2g/L\n2. Apply Trichoderma viride to soil\n3. Remove infected plants immediately\n4. Treat setts with Mancozeb before planting", prevention: "Crop rotation for 4-5 years. Use raised beds. Proper drainage. Avoid mechanical damage to bulbs." }
  ],
  carrot: [
    { name: "Alternaria Leaf Blight", symptoms: "Dark brown to black spots on leaves with yellow margins. Leaf tips turn brown, curl, and die off prematurely.", causes: "Fungus Alternaria dauci. Spreads rapidly in warm, humid weather with frequent rain or overhead irrigation.", remedy: "1. Spray Mancozeb 75% WP at 2.5g/L or Copper Oxychloride 3g/L\n2. Apply Chlorothalonil 75% WP at 2g/L every 10-14 days\n3. Remove and destroy infected plant debris\n4. Avoid overhead sprinkler irrigation", prevention: "Use hot water-treated certified seeds. Follow 3-year crop rotation. Maintain proper spacing." },
    { name: "Powdery Mildew", symptoms: "White powdery fungal patches on leaves and stems. Leaves turn yellow, dry out, and drop.", causes: "Fungus Erysiphe heraclei. Favored by dry weather with high atmospheric humidity.", remedy: "1. Spray Wettable Sulfur 80% WP at 3g/L\n2. Apply Hexaconazole 5% EC at 1ml/L\n3. Spray Neem oil (2%) as a bio-fungicide", prevention: "Plant resistant varieties. Maintain adequate spacing between rows. Avoid excessive nitrogen." },
    { name: "Cavity Spot / Root Rot", symptoms: "Sunken cavities on carrot roots. Roots show dark decay and secondary soft rot.", causes: "Soil-borne Pythium species. Favored by poorly drained, waterlogged soils.", remedy: "1. Drench soil with Metalaxyl + Mancozeb at 2.5g/L\n2. Apply Trichoderma viride bio-fungicide to soil (2.5kg/ha)\n3. Improve field drainage immediately", prevention: "Grow in raised beds with sandy loam soil. Ensure balanced potassium." }
  ],
  brinjal: [
    { name: "Fruit and Shoot Borer", symptoms: "Withered shoot tips. Holes in brinjal fruits with excreted frass inside.", causes: "Leucinodes orbonalis larvae during warm fruiting periods.", remedy: "1. Install pheromone traps (5/acre)\n2. Spray Emamectin Benzoate 5% SG at 0.4g/L or Spinosad 45% SC at 0.3ml/L\n3. Clip off infested shoot tips weekly", prevention: "Intercrop with coriander. Use resistant varieties. Destroy post-harvest crop residue." },
    { name: "Phomopsis Blight & Fruit Rot", symptoms: "Dark brown circular leaf spots. Pale brown sunken fruit rot.", causes: "Fungus Phomopsis vexans. Seed and soil-borne.", remedy: "1. Spray Carbendazim 50% WP at 1g/L\n2. Treat seeds with Thiram 3g/kg", prevention: "Use certified disease-free seeds. Practice 3-year crop rotation." }
  ],
  okra: [
    { name: "Yellow Vein Mosaic Virus", symptoms: "Network of yellow veins on leaves. Pods become pale, hard, and stunted.", causes: "Begomovirus transmitted by Whitefly (Bemisia tabaci).", remedy: "1. Remove virus-infected plants\n2. Spray Imidacloprid 17.8% SL at 0.5ml/L\n3. Set up yellow sticky traps (15/acre)", prevention: "Grow YVMV-resistant varieties (Arka Anamika, Parbhani Kranti)." }
  ]
};

// Crop name normalization for matching
function normalizeCropName(crop: string): string {
  const c = crop.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'paddy': 'rice', 'nel': 'rice', 'dhan': 'rice', 'chawal': 'rice',
    'godumai': 'wheat', 'gehun': 'wheat',
    'paruthi': 'cotton', 'kapas': 'cotton',
    'karumbu': 'sugarcane', 'ganna': 'sugarcane',
    'makka': 'maize', 'corn': 'maize', 'makka cholam': 'maize',
    'thakkali': 'tomato', 'tamatar': 'tomato',
    'milagai': 'chilli', 'mirch': 'chilli', 'mirchi': 'chilli',
    'nilakadalai': 'groundnut', 'peanut': 'groundnut', 'moongfali': 'groundnut',
    'vaazhai': 'banana', 'kela': 'banana',
    'uralai': 'potato', 'aloo': 'potato', 'aaloo': 'potato',
    'vengayam': 'onion', 'pyaaz': 'onion', 'pyaz': 'onion',
    'gajjar': 'carrot', 'gajjai': 'carrot',
  };
  return mapping[c] || c;
}

function getOfflineDiseases(cropName: string): Disease[] {
  const key = normalizeCropName(cropName);
  if (OFFLINE_DISEASES[key] && OFFLINE_DISEASES[key].length > 0) {
    return OFFLINE_DISEASES[key];
  }

  // Generic dynamic crop disease generator for ANY crop
  const c = (cropName || 'Crop').trim().charAt(0).toUpperCase() + (cropName || 'Crop').trim().slice(1);
  return [
    {
      name: `${c} Alternaria Leaf Blight`,
      symptoms: `Dark brown to black spots with yellowish margins on ${c} leaves. Leaves turn brown, curl, and dry off prematurely.`,
      causes: `Fungal pathogen Alternaria species. Favored by high humidity, warm temperature, and rain splash on ${c} foliage.`,
      remedy: `1. Spray Mancozeb 75% WP at 2.5g/L or Copper Oxychloride 3g/L\n2. Apply Chlorothalonil 75% WP at 2g/L every 10-14 days\n3. Remove and destroy infected plant debris\n4. Avoid overhead sprinkler irrigation`,
      prevention: `Use disease-free certified seeds. Practice 3-year crop rotation. Maintain proper spacing and field drainage.`
    },
    {
      name: `${c} Powdery Mildew`,
      symptoms: `White powdery fungal patches on upper leaf surfaces and stems of ${c}. Leaves turn yellow, brittle, and drop.`,
      causes: `Fungus Erysiphe species. Spread by air currents in warm weather with humid mornings.`,
      remedy: `1. Spray Wettable Sulfur 80% WP at 3g/L\n2. Apply Hexaconazole 5% EC at 1ml/L or Dinocap at 1ml/L\n3. Spray Neem oil (2%) as a bio-fungicide`,
      prevention: `Plant resistant varieties. Maintain adequate row spacing. Avoid excessive nitrogen fertilization.`
    },
    {
      name: `${c} Root Rot and Wilt`,
      symptoms: `Sudden wilting of ${c} foliage despite moist soil. Roots show dark brown discoloration and decay.`,
      causes: `Soil-borne pathogens (Fusarium / Pythium). Favored by poorly drained, waterlogged soil.`,
      remedy: `1. Drench soil with Carbendazim 50% WP at 1g/L or Metalaxyl + Mancozeb at 2.5g/L\n2. Apply Trichoderma viride bio-fungicide at 2.5kg/ha\n3. Improve field drainage immediately`,
      prevention: `Grow in raised beds with sandy loam soil. Deep summer ploughing. Practice crop rotation.`
    }
  ];
}

// ==================== LANGUAGE MAP ====================
const getLanguageInstruction = (language: string): string => {
  const instructions: Record<string, string> = {
    tamil: "Respond strictly and ONLY in Tamil (தமிழ்). Use simple, spoken Tamil suitable for farmers. Do not use any English words at all. Use farmer-friendly local vocabulary.",
    hindi: "Respond strictly and ONLY in Hindi (हिंदी). Use simple, spoken Hindi suitable for farmers. Do not use any English words at all.",
    telugu: "Respond strictly and ONLY in Telugu (తెలుగు). Use simple, spoken Telugu suitable for farmers. Do not use any English words at all.",
    malayalam: "Respond strictly and ONLY in Malayalam (മലയാളം). Use simple, spoken Malayalam suitable for farmers. Do not use any English words at all.",
    kannada: "Respond strictly and ONLY in Kannada (கன்னட). Use simple, spoken Kannada suitable for farmers. Do not use any English words at all.",
    english: "Respond in simple English suitable for farmers."
  };
  return instructions[language.toLowerCase()] || instructions.english;
};

// ==================== COMPONENT ====================
const DiseasePrediction: React.FC<Props> = ({ onBack, language, t }) => {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Feature 2: Crop disease list state
  const [diseaseListView, setDiseaseListView] = useState(false);
  const [diseaseLoading, setDiseaseLoading] = useState(false);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [userCrop, setUserCrop] = useState<string>('');
  const [expandedDisease, setExpandedDisease] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);

  // ==================== FEATURE 1: CAMERA ➔ INSTANT DISEASE DETECTION ====================

  // Check if mobile device
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const openCamera = async () => {
    setCameraError(null);

    if (isMobile) {
      // Mobile: use native camera via file input
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
        cameraInputRef.current.click();
      }
      return;
    }

    // Desktop: open webcam via getUserMedia
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setShowWebcam(true);

      // Wait for video element to mount, then attach stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
        }
      }, 100);
    } catch (err) {
      console.warn('[Camera] getUserMedia failed, falling back to file input:', err);
      // Fallback: file picker
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
        cameraInputRef.current.click();
      }
    }
  };

  const captureFromWebcam = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.85);

    // Stop webcam
    closeWebcam();

    // Process image
    setImage(imageData);
    setResult(null);
    setDiseaseListView(false);
    analyzeImageOfflineAware(imageData);
  };

  const closeWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowWebcam(false);
  };

  // Automatically retrieve authenticated farmer's registered crop on mount
  useEffect(() => {
    let isMounted = true;
    const loadFarmerCrop = async () => {
      let cropName = '';

      // 1. Try Firebase Auth / Profile Service
      try {
        const profile = await firebaseAuthService.getProfile();
        if (profile?.crop_type) cropName = profile.crop_type;
      } catch { }

      // 2. Try stored local profile
      if (!cropName) {
        try {
          const stored = getStoredFarmerProfile();
          if (stored?.crop_type) cropName = stored.crop_type;
        } catch { }
      }

      // 3. Try direct Firestore lookup by UID
      if (!cropName && auth.currentUser) {
        try {
          const p = await fetchProfileFromFirestore(auth.currentUser.uid);
          if (p?.crop_type) cropName = p.crop_type;
        } catch { }
      }

      if (isMounted && cropName) {
        setUserCrop(cropName);
        console.log('🌾 [DiseasePrediction] Authenticated farmer registered crop loaded:', cropName);
      }
    };
    loadFarmerCrop();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Offline-aware image analysis
  const analyzeImageOfflineAware = async (imageData: string) => {
    setLoading(true);
    try {
      // Ensure crop context is available
      let activeCrop = userCrop;
      if (!activeCrop) {
        try {
          const profile = await firebaseAuthService.getProfile();
          activeCrop = profile?.crop_type || '';
        } catch { }
      }
      if (!activeCrop && auth.currentUser) {
        try {
          const p = await fetchProfileFromFirestore(auth.currentUser.uid);
          activeCrop = p?.crop_type || '';
        } catch { }
      }

      if (navigator.onLine) {
        // ONLINE: Pass image + registered crop context to AI engine
        const base64Data = imageData.split(',')[1];
        const prediction = await analyzePlantDisease(base64Data, language, activeCrop);
        setResult(prediction);
        // Cache result for offline
        const cacheKey = imageData.substring(imageData.length - 50, imageData.length - 10);
        setCachedAnalysis(cacheKey, prediction);
      } else {
        // OFFLINE: use built-in crop disease database
        console.log('[Disease] Offline mode — using built-in database');
        const cropName = activeCrop || 'Rice';
        const offlineDiseases = getOfflineDiseases(cropName);
        if (offlineDiseases.length > 0) {
          const offlineReport = `📱 OFFLINE MODE — Built-in Database\n\n` +
            `🌾 Registered Crop: ${cropName}\n` +
            `📸 Image captured but cannot analyze without internet.\n\n` +
            `Common diseases for ${cropName}:\n\n` +
            offlineDiseases.map((d, i) =>
              `${i + 1}. 🦠 ${d.name}\n   📋 Symptoms: ${d.symptoms}\n   🔬 Causes: ${d.causes}\n   💊 Remedy: ${d.remedy}\n   🛡️ Prevention: ${d.prevention}\n`
            ).join('\n');
          setResult(offlineReport);
        } else {
          setResult(
            `📱 OFFLINE MODE\n\n📸 Image captured successfully.\n⚠️ Cannot analyze without internet.\n\nPlease connect to internet and try again.`
          );
        }
      }
    } catch (error) {
      console.error("Analysis error:", error);
      const cropForFallback = userCrop || 'Rice';
      const offlineDiseases = getOfflineDiseases(cropForFallback);
      if (offlineDiseases.length > 0) {
        setResult(`⚠️ Analysis unavailable.\n\nCommon diseases for ${cropForFallback}:\n\n` +
          offlineDiseases.map((d, i) => `${i + 1}. 🦠 ${d.name}\n   📋 ${d.symptoms}\n   💊 ${d.remedy}\n`).join('\n'));
      } else {
        setResult(t('analyzeError') || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageData = reader.result as string;
      setImage(imageData);
      setResult(null);
      setCameraError(null);
      setDiseaseListView(false);

      // Auto-analyze (offline-aware)
      analyzeImageOfflineAware(imageData);
    };
    reader.readAsDataURL(file);
  };

  // Also handle file input (fallback for gallery)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setCameraError(null);
        setDiseaseListView(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Manual predict (if user picks from gallery via old flow)
  const predict = async () => {
    if (!image) return;
    await analyzeImageOfflineAware(image);
  };

  // ==================== FEATURE 2: CROP DISEASE LIST ====================
  const fetchCropDiseases = async () => {
    setDiseaseListView(true);
    setDiseaseLoading(true);
    setResult(null);
    setImage(null);

    try {
      // Step 1: Get user's registered crop from profile
      let cropName = userCrop;

      if (!cropName) {
        try {
          const profile = await firebaseAuthService.getProfile();
          cropName = profile?.crop_type || '';
        } catch { }
      }

      if (!cropName) {
        try {
          const stored = getStoredFarmerProfile();
          if (stored?.crop_type) cropName = stored.crop_type;
        } catch { }
      }

      if (!cropName && auth.currentUser) {
        try {
          const p = await fetchProfileFromFirestore(auth.currentUser.uid);
          if (p?.crop_type) cropName = p.crop_type;
        } catch { }
      }

      if (!cropName) {
        cropName = 'Rice'; // Default crop if none registered
      }

      setUserCrop(cropName);

      // Step 2: Check local cache
      const cached = getCachedDiseases(cropName, language);
      if (cached && cached.length > 0) {
        setDiseases(cached);
        setDiseaseLoading(false);
        return;
      }

      // Step 2.5: If OFFLINE, use built-in database
      if (!navigator.onLine) {
        console.log('[Disease] Offline — using built-in database for', cropName);
        const offlineDiseases = getOfflineDiseases(cropName);
        if (offlineDiseases.length > 0) {
          setDiseases(offlineDiseases);
          setCachedDiseases(cropName, language, offlineDiseases);
          setDiseaseLoading(false);
          return;
        }
      }

      // Step 3: Check Firestore crop_diseases collection
      let firestoreDiseases: Disease[] = [];
      try {
        if (db) {
          const cropDoc = await getDoc(doc(db, 'crop_diseases', cropName));
          if (cropDoc.exists() && cropDoc.data()?.diseases) {
            firestoreDiseases = cropDoc.data().diseases;
          }
        }
      } catch (fsErr: any) {
        console.debug('Firestore crop_diseases notice:', fsErr.message);
      }

      if (firestoreDiseases.length > 0 && language.toLowerCase() === 'english') {
        setDiseases(firestoreDiseases);
        setCachedDiseases(cropName, language, firestoreDiseases);
        setDiseaseLoading(false);
        return;
      }

      // Step 4: Use Gemini / LLM to generate disease list (with language enforcement)
      const langInstruction = getLanguageInstruction(language);

      const prompt = `You are an expert agricultural pathologist. List the top 5 most common diseases for the crop "${cropName}".

For each disease, provide:
1. name - Disease name
2. symptoms - Key symptoms farmers can visually identify
3. causes - What causes this disease
4. remedy - Step-by-step treatment including both organic/home remedies (e.g. neem oil, natural extracts) and chemical treatments (with exact dosage)
5. prevention - How to prevent it naturally and culturally

${langInstruction}

Return ONLY valid JSON array format like this (no other text, no markdown):
[
  {
    "name": "Disease Name",
    "symptoms": "Visible symptoms description",
    "causes": "What causes this",
    "remedy": "🏡 Organic & Home Remedy:\\n1. Natural step\\n\\n💊 Chemical Remedy:\\n2. Step two with dosage",
    "prevention": "Prevention methods"
  }
]`;

      let responseText = '';

      // Try Gemini first — only if API key is available
      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (geminiApiKey) {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey: geminiApiKey });
          const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
          });
          responseText = response.text || '';
        } catch (geminiErr) {
          console.warn('[Disease] Gemini failed, trying Groq:', geminiErr);
        }
      } else {
        console.log('[Disease] No Gemini API key, skipping to fallback');
      }

      // Layer 2: NVIDIA NIM via Backend Proxy (server-side, no CORS)
      if (!responseText.trim()) {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        try {
          console.log('[Disease] Trying NVIDIA NIM via Backend Proxy...');
          const nimRes = await fetch(`${apiUrl}/api/nvidia/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'meta/llama-3.3-70b-instruct',
              messages: [
                { role: 'system', content: 'You are an expert agricultural pathologist. Return ONLY valid JSON array. No markdown.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.3,
              max_tokens: 4096,
            }),
          });
          if (nimRes.ok) {
            const data = await nimRes.json();
            responseText = data?.choices?.[0]?.message?.content || '';
            if (responseText.trim()) {
              console.log('[Disease] NVIDIA NIM Proxy OK');
            }
          }
        } catch (proxyErr) {
          console.warn('[Disease] Backend Proxy error:', proxyErr);
        }
      }

      // Layer 3: Groq fallback
      if (!responseText.trim()) {
        try {
          const groqKey = import.meta.env.VITE_GROQ_API_KEY || '';
          if (groqKey) {
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: 'You are an expert agricultural pathologist. Return ONLY valid JSON array. No markdown.' },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 4096,
              }),
            });
            if (groqRes.ok) {
              const data = await groqRes.json();
              responseText = data?.choices?.[0]?.message?.content || '';
              if (responseText.trim()) {
                console.log('[Disease] Groq fallback OK');
              }
            }
          } else {
            console.log('[Disease] No Groq API key, using offline crop disease database');
          }
        } catch (groqErr) {
          console.warn('[Disease] Groq fallback error:', groqErr);
        }
      }

      // If no AI response, use offline database
      if (!responseText.trim()) {
        const offlineFallback = getOfflineDiseases(cropName);
        if (offlineFallback.length > 0) {
          console.log('[Disease] Using built-in offline database for', cropName);
          setDiseases(offlineFallback);
          setCachedDiseases(cropName, language, offlineFallback);
          setDiseaseLoading(false);
          return;
        }
        responseText = '[]';
      }

      // Clean and extract JSON array from text response (handles conversational intro/outro text)
      let parsedDiseases: Disease[] = [];
      try {
        let cleanText = responseText.trim();
        if (cleanText.includes('```json')) {
          cleanText = cleanText.split('```json')[1].split('```')[0].trim();
        } else if (cleanText.includes('```')) {
          cleanText = cleanText.split('```')[1].split('```')[0].trim();
        }

        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const jsonArrStr = cleanText.substring(firstBracket, lastBracket + 1);
          try {
            parsedDiseases = JSON.parse(jsonArrStr);
            console.log('[Disease] Clean JSON parse OK, got', parsedDiseases.length, 'diseases');
          } catch (jsonErr) {
            console.warn('[Disease] Direct JSON slice parse failed, attempting repair:', jsonErr);
            // Repair truncated JSON array: find last complete object brace and close array
            const lastBrace = jsonArrStr.lastIndexOf('}');
            if (lastBrace > 0) {
              const repaired = jsonArrStr.substring(0, lastBrace + 1) + ']';
              try {
                parsedDiseases = JSON.parse(repaired);
                console.log('[Disease] JSON repaired successfully, items:', parsedDiseases.length);
              } catch (repErr) {
                console.error('[Disease] JSON repair failed:', repErr);
              }
            }
          }
        } else if (firstBracket !== -1) {
          // Truncated response without closing bracket
          const jsonArrStr = cleanText.substring(firstBracket);
          const lastBrace = jsonArrStr.lastIndexOf('}');
          if (lastBrace > 0) {
            const repaired = jsonArrStr.substring(0, lastBrace + 1) + ']';
            try {
              parsedDiseases = JSON.parse(repaired);
              console.log('[Disease] Truncated JSON repaired, items:', parsedDiseases.length);
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.error('[Disease] JSON parsing exception:', err);
      }

      // CRITICAL GUARANTEE: Fallback to built-in offline disease database if AI returns empty array
      if (!parsedDiseases || parsedDiseases.length === 0) {
        console.log('[Disease] AI returned empty array — using built-in database for', cropName);
        parsedDiseases = getOfflineDiseases(cropName);
      }

      setDiseases(parsedDiseases);
      setCachedDiseases(cropName, language, parsedDiseases);

      // Also save to Firestore for future use (if English)
      if (language.toLowerCase() === 'english' && parsedDiseases.length > 0) {
        try {
          await setDoc(doc(db, 'crop_diseases', cropName), {
            diseases: parsedDiseases,
            updated_at: new Date().toISOString()
          }, { merge: true });
        } catch { /* ignore write errors */ }
      }

    } catch (error) {
      console.error("Crop disease fetch error:", error);
      // Fallback to offline database on any error
      const cropForFallback = userCrop || 'Rice';
      const offlineFallback = getOfflineDiseases(cropForFallback);
      if (offlineFallback.length > 0) {
        console.log('[Disease] Error fallback — using built-in database');
        setDiseases(offlineFallback);
        setCachedDiseases(cropForFallback, language, offlineFallback);
      } else {
        setCameraError(t('analyzeError') || 'Failed to load disease data. Please try again.');
      }
    } finally {
      setDiseaseLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setCameraError(null);
    setDiseaseListView(false);
    setDiseases([]);
    setExpandedDisease(null);
  };

  // ==================== RENDER: DISEASE LIST VIEW ====================
  const renderDiseaseList = () => (
    <div className="w-full max-w-sm animate-in fade-in zoom-in duration-300">
      {/* Crop Header */}
      <div className="bg-white/95 backdrop-blur-md rounded-[32px] shadow-2xl border-l-[12px] border-[#2da95c] p-5 mb-4">
        <h3 className="text-xl font-black italic text-gray-900 uppercase tracking-tight flex items-center gap-2">
          <Leaf size={20} className="text-[#2da95c]" />
          {userCrop}
        </h3>
        <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">
          {t('common_diseases') || 'COMMON DISEASES & REMEDIES'}
        </p>
      </div>

      {/* Disease Cards */}
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 no-scrollbar">
        {diseases.map((disease, index) => (
          <div
            key={index}
            className="bg-white/95 backdrop-blur-md rounded-[20px] shadow-lg border border-gray-100 overflow-hidden transition-all duration-300"
          >
            {/* Disease Header - Always Visible */}
            <div
              onClick={() => setExpandedDisease(expandedDisease === index ? null : index)}
              className="flex items-center justify-between p-4 cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                  <ShieldAlert size={16} className="text-red-500" />
                </div>
                <span className="text-sm font-black text-gray-800 leading-tight">{disease.name}</span>
              </div>
              {expandedDisease === index ? (
                <ChevronUp size={18} className="text-gray-400 shrink-0" />
              ) : (
                <ChevronDown size={18} className="text-gray-400 shrink-0" />
              )}
            </div>

            {/* Expanded Content */}
            {expandedDisease === index && (
              <div className="px-4 pb-4 space-y-3 animate-in fade-in duration-200">
                {/* Symptoms */}
                <div className="bg-amber-50/80 rounded-xl p-3 border border-amber-100">
                  <p className="text-[10px] font-[900] text-amber-700 uppercase tracking-widest mb-1">
                    {t('symptoms') || 'SYMPTOMS'}
                  </p>
                  <p className="text-xs font-bold text-gray-700 leading-relaxed">{disease.symptoms}</p>
                </div>

                {/* Causes */}
                <div className="bg-blue-50/80 rounded-xl p-3 border border-blue-100">
                  <p className="text-[10px] font-[900] text-blue-700 uppercase tracking-widest mb-1">
                    {t('causes') || 'CAUSES'}
                  </p>
                  <p className="text-xs font-bold text-gray-700 leading-relaxed">{disease.causes}</p>
                </div>

                {/* Remedy */}
                <div className="bg-green-50/80 rounded-xl p-3 border border-green-100">
                  <p className="text-[10px] font-[900] text-[#2da95c] uppercase tracking-widest mb-1">
                    {t('remedy') || 'REMEDY'}
                  </p>
                  <p className="text-xs font-bold text-gray-700 leading-relaxed whitespace-pre-line">{disease.remedy}</p>
                </div>

                {/* Prevention */}
                <div className="bg-purple-50/80 rounded-xl p-3 border border-purple-100">
                  <p className="text-[10px] font-[900] text-purple-700 uppercase tracking-widest mb-1">
                    {t('prevention') || 'PREVENTION'}
                  </p>
                  <p className="text-xs font-bold text-gray-700 leading-relaxed">{disease.prevention}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Back Button */}
      <button
        onClick={reset}
        className="mt-4 w-full bg-[#2da95c] text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 uppercase tracking-tighter shadow-md active:scale-95 transition-all"
      >
        <RotateCcw size={20} />
        {t('try_another') || 'TRY AGAIN'}
      </button>
    </div>
  );

  // ==================== MAIN RENDER ====================
  return (
    <div className="relative flex flex-col h-screen overflow-hidden font-['Inter']">

      {/* WEBCAM CAPTURE MODAL (Desktop) */}
      {showWebcam && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {/* Controls overlay */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-8 pb-10 bg-gradient-to-t from-black/70 to-transparent pt-20">
            {/* Close button */}
            <button
              onClick={closeWebcam}
              className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white font-black text-xl shadow-lg active:scale-90 transition-all"
            >
              ✕
            </button>
            {/* Capture button */}
            <button
              onClick={captureFromWebcam}
              className="w-20 h-20 rounded-full bg-white border-4 border-[#2da95c] flex items-center justify-center shadow-2xl active:scale-90 transition-all"
            >
              <div className="w-16 h-16 rounded-full bg-[#2da95c]" />
            </button>
          </div>
          {/* Top label */}
          <div className="absolute top-6 left-0 right-0 text-center">
            <p className="text-white font-black text-sm uppercase tracking-wider drop-shadow-lg">
              📸 {t('capture_plant') || 'Point at the plant & capture'}
            </p>
          </div>
        </div>
      )}
      {/* Hidden canvas for webcam capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* FULL-SCREEN BACKGROUND IMAGE - BRIGHT AND CLEAR */}
      <div
        className="absolute inset-0 bg-cover bg-center z-0 pointer-events-none"
        style={{
          backgroundImage: `url('https://image2url.com/r2/default/images/1770524514673-7d0afcea-11ba-40ce-8cc3-bb3d4ec3b32a.png')`,
        }}
      />

      {/* NO OVERLAY AS PER STRICT MATCH */}
      <div className="absolute inset-0 bg-transparent z-0 pointer-events-none" />

      {/* HEADER SECTION */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-10 pb-4">
        {/* BACK BUTTON ADDED PER REQUEST */}
        <button
          onClick={onBack}
          className="text-black hover:opacity-70 active:scale-90 transition-all z-20"
        >
          <ArrowLeft size={36} strokeWidth={3} />
        </button>

        <h1 className="absolute left-0 right-0 text-[26px] font-[1000] text-black uppercase tracking-tighter text-center leading-[1.05] drop-shadow-sm select-none pointer-events-none">
          {t('home_disease')}
        </h1>

        <div className="w-11 h-11 bg-black rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform z-20">
          <Search size={26} className="text-white" strokeWidth={3} />
        </div>
      </header>

      {/* MAIN CONTENT AREA - STRICT VERTICAL CENTER ALIGNMENT */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto no-scrollbar pb-10">

        {/* Disease List View */}
        {diseaseListView ? (
          diseaseLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-[#2da95c] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-black text-gray-600 uppercase tracking-wider animate-pulse">
                {t('loading') || 'Loading'}...
              </p>
            </div>
          ) : diseases.length > 0 ? (
            renderDiseaseList()
          ) : (
            <div className="text-center">
              <p className="text-sm font-bold text-red-500">{cameraError || 'No diseases found'}</p>
              <button onClick={reset} className="mt-4 bg-[#2da95c] text-white font-black py-3 px-8 rounded-2xl active:scale-95 transition-all">
                <RotateCcw size={18} className="inline mr-2" />
                {t('try_another') || 'TRY AGAIN'}
              </button>
            </div>
          )
        ) : result ? (
          /* Camera Analysis Result Card */
          <div className="w-full max-w-sm animate-in fade-in zoom-in duration-300">
            {/* Captured Image */}
            {image && (
              <div className="mb-3 rounded-[24px] overflow-hidden shadow-lg border-2 border-[#2da95c]/30">
                <img src={image} alt="Captured plant" className="w-full max-h-52 object-cover" />
              </div>
            )}

            {/* Diagnosis Card */}
            <div className="p-6 bg-white/95 backdrop-blur-md rounded-[32px] shadow-2xl border-l-[12px] border-[#2da95c]">
              <h3 className="text-xl font-black italic text-gray-900 mb-4 border-b border-gray-200 pb-2 uppercase tracking-tight flex items-center gap-2">
                <ShieldAlert size={20} className="text-[#2da95c]" />
                {t('diagnosis')}
              </h3>
              <div className="text-gray-700 font-bold italic whitespace-pre-line leading-relaxed text-sm max-h-[40vh] overflow-y-auto pr-2 no-scrollbar">
                {result}
              </div>
              <button
                onClick={reset}
                className="mt-6 w-full bg-[#2da95c] text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 uppercase tracking-tighter shadow-md active:scale-95 transition-all"
              >
                <RotateCcw size={20} />
                {t('try_another')}
              </button>
            </div>
          </div>
        ) : (
          /* Default: Two Icon Buttons */
          <div className="flex flex-col items-center justify-center gap-8 w-full">

            {/* CAMERA ACTION ICON (TOP) - DIRECTLY OPENS CAMERA */}
            <div
              onClick={openCamera}
              className="flex flex-col items-center cursor-pointer group"
            >
              <div className="relative flex items-center justify-center rounded-full border-[3px] border-[#2da95c] w-[215px] h-[215px] p-[5px] bg-transparent active:scale-95 transition-all shadow-xl">
                <div className="w-full h-full rounded-full border-[3px] border-[#2da95c] flex items-center justify-center bg-white overflow-hidden shadow-inner">
                  {loading && (
                    <div className="absolute inset-0 bg-white/60 z-20 flex items-center justify-center rounded-full">
                      <div className="w-12 h-12 border-4 border-[#2da95c] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  <img
                    src="https://image2url.com/r2/default/images/1770524593385-ef74a8b1-4a9c-49c4-9cea-aef06a886425.png"
                    alt="Capture Image"
                    className="w-[92%] h-[92%] object-contain block opacity-100"
                  />
                </div>
              </div>
            </div>

            {/* AI PLANT DISEASE ICON (BOTTOM) - CROP DISEASE LIST */}
            <div
              onClick={fetchCropDiseases}
              className="flex flex-col items-center group transition-all duration-300 opacity-100 cursor-pointer"
            >
              <div className="relative flex items-center justify-center rounded-full border-[3px] border-[#2da95c] w-[215px] h-[215px] p-[5px] bg-transparent active:scale-95 transition-all shadow-xl">
                <div className="w-full h-full rounded-full border-[3px] border-[#2da95c] flex items-center justify-center bg-white overflow-hidden relative shadow-inner">
                  <img
                    src="https://www.image2url.com/r2/default/images/1786975626882-ba4df1ff-9ea8-4e15-97b9-9818c693da42.png"
                    alt="AI Analysis"
                    className="w-[92%] h-[92%] object-contain block opacity-100"
                  />
                </div>
              </div>
            </div>

            {cameraError && (
              <div className="absolute bottom-4 flex items-center gap-2 text-red-600 font-bold text-xs bg-white/80 p-3 rounded-xl shadow-sm border border-red-100">
                <AlertCircle size={16} />
                {cameraError}
              </div>
            )}
          </div>
        )}

        {/* Hidden Camera Input - ALWAYS in DOM (outside conditional) */}
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraCapture}
        />

        {/* Hidden File Input - Gallery fallback */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        h1 { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
};

export default DiseasePrediction;
