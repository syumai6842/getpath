import { fetchLocationData, Point } from "./firebaseService";
import polyline from 'polyline'; // ポリラインライブラリをインポート
import axios from 'axios';

// HERE Routing APIのエンドポイント
const HERE_API_URL = 'https://router.hereapi.com/v8/routes';

// 環境変数からAPIキーを取得
const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || '';

// インストラクション（ルート案内）の型定義
interface Instruction {
    text: string;
    distance: number;
    time: number;
    interval: [number, number];
}

// 各ルートの詳細情報の型定義
interface RoutePath {
    distance: number;  // ルートの総距離（メートル）
    time: number;      // ルートの総時間（ミリ秒）
    geometry: {
        coordinates: [number, number][]; // 経緯度の配列 (経度, 緯度)
    };
    instructions: Instruction[];
    bbox: [number, number, number, number];  // バウンディングボックス
}

// HERE APIのレスポンス全体の型定義
interface HereServiceResponse {
    routes: {
        sections: {
            polyline: string;  // ポリライン形式のルート
            summary: {
                duration: number;  // ルートの総時間（秒）
                length: number;    // ルートの総距離（メートル）
            };
            instructions: Instruction[];  // 各区間の指示
        }[];
    }[];
}

// ルート検索関数（歩行者用）
const searchRouteForPedestrians = async (
    startPoint: [number, number],
    endPoint: [number, number],
    pointsToAvoid: Point[]
): Promise<HereServiceResponse> => {
    try {
        // 避けたいポイントをポリゴン形式に変換
        const avoidAreas = pointsToAvoid.map(point => `${point.lat},${point.lng}`);

        // HERE Routing APIリクエスト
        const response = await axios.get(HERE_API_URL, {
            params: {
                apiKey: hereApiKey,
                transportMode: 'pedestrian', // 歩行者用のモードを指定

                origin: `${startPoint[1]},${startPoint[0]}`, // 出発地点
                destination: `${endPoint[1]},${endPoint[0]}`, // 到着地点
                avoidAreas: avoidAreas.join('|'),  // 回避エリアをポリゴン形式で指定
                return: 'polyline'  // ポリライン形式でルートを返す
            }
        });

        return response.data as HereServiceResponse;
    } catch (error) {
        console.error('Error fetching pedestrian route:', error);
        throw new Error('Failed to fetch pedestrian route');
    }
};

// Google Maps API形式のポリラインに変換
const convertToGooglePolyline = (encodedPolyline: string): { lat: number; lng: number }[] => {
    const decodedPath = polyline.decode(encodedPolyline);
    return decodedPath.map(([lat, lng]) => ({ lat, lng }));  // { lat, lng }形式で返す
};



// 安全な歩行者ルートを取得し、ポリライン形式に変換する関数
export async function GetSafePedestrianRoute(
    startPoint: [number, number],
    endPoint: [number, number]
): Promise<[{
    lat: number;
    lng: number;
}[], Point[]]> {
    // Firebaseからリスクポイントを取得
    const risks: Point[] = await fetchLocationData();

    // HERE APIからルートを取得
    const response: HereServiceResponse = await searchRouteForPedestrians(startPoint, endPoint, risks);

    // 最初のルートセクションのポリラインをGoogle Mapsのポリライン形式に変換
    const polylineString = convertToGooglePolyline(response.routes[0].sections[0].polyline);

    // Google Maps API形式のポリラインを返す
    return [polylineString, risks];
}