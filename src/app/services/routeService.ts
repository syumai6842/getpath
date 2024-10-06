import { fetchLocationData, Point } from "./firebaseService";
import polyline, { encode } from 'polyline'; // Import polyline library
import axios from 'axios';
import {decode} from './polylineService'


// HERE Routing API endpoint
const HERE_API_URL = 'https://router.hereapi.com/v8/routes';

// Get API Key from environment variables
const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || '';

// Instruction definition for route guidance
interface Instruction {
    text: string;
    distance: number;
    time: number;
    interval: [number, number];
}

// RoutePath definition
interface RoutePath {
    distance: number;  // Total route distance (meters)
    time: number;      // Total route time (milliseconds)
    geometry: {
        coordinates: [number, number][]; // Array of lat/lng coordinates
    };
    instructions: Instruction[];
    bbox: [number, number, number, number];  // Bounding box
}

// Notice definition for sections
interface Notice {
    title: string;
    code: string;
    severity: string;
}

// Updated HERE API response type to include notices
interface HereServiceResponse {
    routes: {
        sections: {
            polyline: string;  // Route polyline in string format
            summary: {
                duration: number;  // Total route time (seconds)
                length: number;    // Total route distance (meters)
            };
            instructions: Instruction[];  // Step-by-step instructions
            notices?: Notice[];  // Optional notices array
        }[];
    }[];
}

// Function to search for pedestrian route avoiding a corridor
const searchRouteForPedestrians = async (
    startPoint: [number, number],
    endPoint: [number, number],
    pointsToAvoid: Point[]
): Promise<HereServiceResponse> => {
    try {
        // Filter out invalid risk points
        const validRisks = pointsToAvoid.filter(risk => risk.lat !== undefined && risk.lng !== undefined);

        // Encode the polyline from risk points (for the corridor)
        const m = 0.0001;
        const boxPolyline = validRisks.map(risk => `bbox:${risk.lng-m},${risk.lat-m},${risk.lng+m},${risk.lat+m}`).join('|');

        // HERE Routing API request
        const response = await axios.get(HERE_API_URL, {
            params: {
                apiKey: hereApiKey,
                transportMode: 'pedestrian', // Set mode to pedestrian
                origin: `${startPoint[1]},${startPoint[0]}`, // Origin (lat, lng)
                destination: `${endPoint[1]},${endPoint[0]}`, // Destination (lat, lng)
                "avoid[areas]":boxPolyline == "" ? null : boxPolyline,
                return: 'polyline,summary'  // Return route as polyline
            }
        });

        console.log(response);
        return response.data as HereServiceResponse;
    } catch (error) {
        console.error('Error fetching pedestrian route:', error);
        throw new Error('Failed to fetch pedestrian route');
    }
};

// Convert HERE API polyline to Google Maps API polyline format
const convertToGooglePolyline = (encodedPolyline: string): { lat: number; lng: number }[] => {
    const decodedPath = decode(encodedPolyline).polyline;
    return decodedPath.map(([lat, lng]) => ({ lat, lng }));  // Convert to { lat, lng } format
};

const isViolated = (response: HereServiceResponse): boolean => {
    // 全てのルートのセクションをフラットにして、すべてのnoticesを検索
    const notice = response.routes
        .flatMap(route => route.sections)  // すべてのsectionsをフラットにする
        .flatMap(section => section.notices || [])  // noticesをフラットにし、存在しない場合は空配列
        .find(notice => notice.code === "violatedBlockedRoad");

    return notice != undefined;
};

// Function to get safe pedestrian route and convert to Google Maps polyline format
export async function GetSafePedestrianRoute(
    startPoint: [number, number],
    endPoint: [number, number]
): Promise<[{
    lat: number;
    lng: number;
}[], Point[]]> {
    // Fetch risk points from Firebase
    const risks: Point[] = await fetchLocationData();
    // Get route from HERE API
    let response: HereServiceResponse = await searchRouteForPedestrians(startPoint, endPoint, risks);
    
    const minTime: number = (await searchRouteForPedestrians(startPoint, endPoint, []) as HereServiceResponse).routes[0].sections[0].summary.duration;
    
    for(let i:number = 1; i < 5 && (isViolated(response) || minTime * 1.2 < response.routes[0].sections[0].summary.duration); i++){
        response = await searchRouteForPedestrians(startPoint, endPoint, risks.filter((value: Point, index: number, array: Point[])=>value.risk > i))
        console.log(`riskLevel ${i} is violated`);
    }

    // Convert the first route section polyline to Google Maps format
    let polylineArray = convertToGooglePolyline(response.routes[0].sections[0].polyline);

    // Return polyline and risk points
    return [polylineArray, risks];
}
