import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface GeocodingResponse {
  results?: Array<{
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
    formatted_address?: string;
  }>;
}

interface PlacesSearchResponse {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    googleMapsUri?: string;
    websiteUri?: string;
    regularOpeningHours?: {
      openNow?: boolean;
    };
  }>;
}

type PlaceResult = NonNullable<PlacesSearchResponse["places"]>[number];

const serviceTypeMap: Record<string, string> = {
  lava_rapido: "car_wash",
  cinema: "movie_theater",
  restaurante: "restaurant",
  farmacia: "pharmacy",
  mercado: "supermarket",
  oficina: "car_repair",
};

export const placesSearchTool = {
  name: "search_nearby_places",
  description:
    "Busca lugares realmente proximos de um CEP, bairro ou cidade usando Google Places e retorna nome, nota, endereco, telefone e link do mapa.",
  parameters: {
    type: "OBJECT",
    properties: {
      serviceType: {
        type: "STRING",
        enum: ["lava_rapido", "cinema", "restaurante", "farmacia", "mercado", "oficina"],
        description: "Tipo do lugar procurado.",
      },
      textQuery: {
        type: "STRING",
        description:
          "Consulta textual especifica, como 'feijoada', 'rodizio', 'ramen' ou 'lava rapido 24 horas'.",
      },
      locationQuery: {
        type: "STRING",
        description: "CEP, bairro, cidade ou endereco usado como referencia geográfica.",
      },
    },
    required: ["locationQuery"],
  },

  execute: async (args: { serviceType?: string; textQuery?: string; locationQuery: string }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return "A busca de lugares nao esta configurada no momento.";
    }

    try {
      console.log("[Places] geocoding", { locationQuery: args.locationQuery });

      const geocodeResponse = await axios.get<GeocodingResponse>(
        "https://maps.googleapis.com/maps/api/geocode/json",
        {
          params: {
            address: args.locationQuery,
            key: apiKey,
            region: "br",
          },
          timeout: 30000,
        }
      );

      const location = geocodeResponse.data.results?.[0]?.geometry?.location;
      const formattedAddress =
        geocodeResponse.data.results?.[0]?.formatted_address || args.locationQuery;

      if (!location) {
        return "Nao consegui localizar esse CEP/endereco para buscar lugares proximos.";
      }

      const includedType = args.serviceType
        ? serviceTypeMap[args.serviceType] || args.serviceType
        : undefined;
      const textQuery = args.textQuery?.trim();

      console.log("[Places] search", {
        serviceType: args.serviceType,
        includedType,
        textQuery,
        formattedAddress,
      });

      const placesResponse = textQuery
        ? await axios.post<PlacesSearchResponse>(
            "https://places.googleapis.com/v1/places:searchText",
            {
              textQuery,
              pageSize: 10,
              locationBias: {
                circle: {
                  center: {
                    latitude: location.lat,
                    longitude: location.lng,
                  },
                  radius: 5000,
                },
              },
              ...(includedType ? { includedType } : {}),
            },
            {
              timeout: 30000,
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask":
                  "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.websiteUri,places.regularOpeningHours.openNow",
              },
            }
          )
        : await axios.post<PlacesSearchResponse>(
            "https://places.googleapis.com/v1/places:searchNearby",
            {
              includedTypes: includedType ? [includedType] : [],
              maxResultCount: 10,
              rankPreference: "DISTANCE",
              locationRestriction: {
                circle: {
                  center: {
                    latitude: location.lat,
                    longitude: location.lng,
                  },
                  radius: 5000,
                },
              },
            },
            {
              timeout: 30000,
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask":
                  "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.websiteUri,places.regularOpeningHours.openNow",
              },
            }
          );

      const places = placesResponse.data.places || [];
      if (places.length === 0) {
        return "Nao encontrei lugares proximos com esse criterio.";
      }

      const rankedPlaces = places
        .filter((place) => (place.rating ?? 0) >= 3.5 || (place.userRatingCount ?? 0) >= 8)
        .sort((a, b) => {
          const scoreA = (a.rating ?? 0) * 100 + Math.min(a.userRatingCount ?? 0, 200);
          const scoreB = (b.rating ?? 0) * 100 + Math.min(b.userRatingCount ?? 0, 200);
          return scoreB - scoreA;
        });

      const selectedPlaces: PlaceResult[] = (rankedPlaces.length > 0 ? rankedPlaces : places).slice(
        0,
        5
      );

      const lines: string[] = [];
      lines.push("BUSCA_LUGARES_PROXIMOS");
      lines.push(`Referencia: ${formattedAddress}`);
      if (args.serviceType) {
        lines.push(`Servico: ${args.serviceType}`);
      }
      if (textQuery) {
        lines.push(`Consulta: ${textQuery}`);
      }
      lines.push("Resultados:");

      for (const [index, place] of selectedPlaces.entries()) {
        lines.push(`${index + 1}. ${place.displayName?.text || "Sem nome"}`);
        if (typeof place.rating === "number") {
          lines.push(`Nota: ${place.rating.toFixed(1)} (${place.userRatingCount || 0} avaliacoes)`);
        }
        if (place.formattedAddress) {
          lines.push(`Endereco: ${place.formattedAddress}`);
        }
        if (place.nationalPhoneNumber || place.internationalPhoneNumber) {
          lines.push(`Telefone: ${place.nationalPhoneNumber || place.internationalPhoneNumber}`);
        }
        if (typeof place.regularOpeningHours?.openNow === "boolean") {
          lines.push(`Aberto agora: ${place.regularOpeningHours.openNow ? "sim" : "nao"}`);
        }
        if (place.googleMapsUri) {
          lines.push(`Mapa: ${place.googleMapsUri}`);
        }
        if (place.websiteUri) {
          lines.push(`Site: ${place.websiteUri}`);
        }
      }

      return lines.join("\n");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("[Places] erro na busca:", {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          data: error.response?.data,
        });
      } else {
        console.error("[Places] erro na busca:", error);
      }
      return "A busca de lugares proximos falhou no momento. Tente novamente em instantes.";
    }
  },
};
