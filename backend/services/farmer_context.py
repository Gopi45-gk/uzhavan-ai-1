"""
Farmer Context Builder Service
Aggregates Farmer Profile, Live Weather, Agmarknet Market Predictions, and Recent Disease Diagnosis into a unified, runtime FarmerContext object.
Provides risk-aware system prompt formatting for RAG and LLMs.
"""

from typing import Optional, Dict, Any

class FarmerContextBuilder:
    def __init__(self):
        self.recent_disease_context: Dict[str, Any] = {}

    def set_disease_context(self, user_uid: str, disease_name: str, confidence: str, treatment: str = ""):
        self.recent_disease_context[user_uid] = {
            "disease": disease_name,
            "confidence": confidence,
            "treatment": treatment
        }

    def get_disease_context(self, user_uid: str) -> Dict[str, Any]:
        return self.recent_disease_context.get(user_uid, {})

    def build_context(
        self,
        user_profile: Dict[str, Any],
        weather_data: Optional[Dict[str, Any]] = None,
        market_data: Optional[Dict[str, Any]] = None,
        user_uid: str = "default_user"
    ) -> Dict[str, Any]:
        """
        Builds dynamic runtime context for the authenticated farmer.
        Strictly isolates farmer data using user_uid / profile keys.
        """
        district = user_profile.get("location") or user_profile.get("district") or "Thanjavur"
        crop = user_profile.get("crop_type") or "Paddy"
        soil = user_profile.get("soil_type") or "Alluvial"
        lang = user_profile.get("language") or "english"
        name = user_profile.get("name") or "Uzhavan Farmer"

        curr_weather = {}
        rain_alert = {"has_alert": False, "alert_message": "No heavy rain expected."}
        if weather_data:
            curr_weather = weather_data.get("current", {})
            rain_alert = weather_data.get("rain_alert", rain_alert)

        crop_market = {}
        if market_data and "prices" in market_data:
            # Look for crop match in grains, vegetables, or fruits
            prices_dict = market_data["prices"]
            for cat in ["grains", "vegetables", "fruits"]:
                for item in prices_dict.get(cat, []):
                    if crop.lower() in item.get("commodity", "").lower():
                        crop_market = item
                        break
                if crop_market:
                    break

        disease_info = self.get_disease_context(user_uid)

        context_obj = {
            "farmer": {
                "name": name,
                "district": district,
                "crop": crop,
                "soil": soil,
                "language": lang,
                "user_type": user_profile.get("user_type", "farmer"),
                "experience": user_profile.get("experience", "5 Years"),
                "farming_type": user_profile.get("farming_type", "Organic")
            },
            "weather": {
                "temperature": curr_weather.get("temperature", 31.0),
                "humidity": curr_weather.get("humidity", 65),
                "windspeed": curr_weather.get("windspeed", 14.0),
                "description": curr_weather.get("weather_description", "Clear"),
                "has_rain_alert": rain_alert.get("has_alert", False),
                "rain_alert_message": rain_alert.get("alert_message", "")
            },
            "market": {
                "commodity": crop_market.get("commodity", crop),
                "variety": crop_market.get("variety", "Standard"),
                "modal_price": crop_market.get("modal_price", 2450),
                "trend": crop_market.get("trend", "stable"),
                "predicted_next_price": crop_market.get("predicted_next_price", 2450),
                "percentage_change": crop_market.get("percentage_change", 0.0)
            },
            "disease": disease_info
        }

        return context_obj

    def format_system_prompt_extension(self, context_obj: Dict[str, Any]) -> str:
        """
        Formats the context object into a clear LLM system prompt injection block.
        Includes risk alerts (rain warning, market movement, soil specifics).
        """
        f = context_obj["farmer"]
        w = context_obj["weather"]
        m = context_obj["market"]
        d = context_obj["disease"]

        rain_warning = "⚠️ RAIN WARNING: Heavy rainfall expected in farmer's district. Advise AGAINST spraying pesticides/fertilizers or harvesting today." if w["has_rain_alert"] else "Weather is dry/clear for field activities."

        disease_block = f"Recent Crop Diagnosis: {d.get('disease')} (Confidence: {d.get('confidence')})" if d.get("disease") else "No active disease diagnosis recorded recently."

        prompt_str = f"""
==================================================
AUTHENTICATED FARMER RUNTIME CONTEXT (AUTOMATICALLY INJECTED)
==================================================
Farmer Name: {f['name']}
Registered Location / District: {f['district']}
Main Crop: {f['crop']}
Soil Type: {f['soil']}
Language Preference: {f['language']}
Farming Type: {f['farming_type']}

LIVE WEATHER ({f['district']}):
- Temperature: {w['temperature']}°C
- Condition: {w['description']}
- Rain Status: {rain_warning}

LIVE AGMARKNET MARKET DATA ({f['crop']} in {f['district']}):
- Modal Price: ₹{m['modal_price']}/quintal
- Trend: {m['trend'].upper()} (Expected Next: ₹{m['predicted_next_price']}/quintal, Change: {m['percentage_change']}%)

DISEASE CONTEXT:
- {disease_block}
==================================================
INSTRUCTIONS:
1. Always personalize your answer specifically for this farmer growing {f['crop']} in {f['district']} with {f['soil']} soil.
2. Respect live weather conditions: If rain warning is active, do NOT suggest spraying chemicals or outdoor harvesting.
3. Incorporate current market trend insights when discussing crop harvesting or sale timing.
4. Respond in the farmer's requested language ({f['language']}).
==================================================
"""
        return prompt_str

farmer_context_builder = FarmerContextBuilder()
