"use client";
import { useState, useEffect, useCallback } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { GetSafePedestrianRoute } from "./services/routeService";
import { Point } from "./services/firebaseService";

const containerStyle = {
  width: "100%",
  height: "500px",
};

const libraries: ("geometry" | "places")[] = ["geometry"];

const center = {
  lat: 35.682839,
  lng: 139.759455,
};

function Home() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [endPoint, setEndPoint] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeData, setRouteData] = useState<{ path: google.maps.LatLngLiteral[]; risks: Point[] }>({ path: [], risks: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getGeolocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setCurrentLocation({ lat: latitude, lng: longitude }); // ここで緯度・経度が正しい数値か確認
          },
          (error) => {
            console.error("Error getting current position:", error);
            setError("位置情報の取得中にエラーが発生しました。");
          },
          { enableHighAccuracy: true }
        );        
      } else {
        setError("Geolocationがサポートされていません。");
      }
    };

    getGeolocation();
  }, []);

  const fetchSafeRoute = useCallback(
    async (endPoint: google.maps.LatLngLiteral) => {
      if (currentLocation) {
        try {
          const start: [number, number] = [currentLocation.lng, currentLocation.lat];
          const end: [number, number] = [endPoint.lng, endPoint.lat];
          const [routePolyline, risks] = await GetSafePedestrianRoute(start, end);
          
          // pathとrisksをまとめてstateに保存
          setRouteData({ path: routePolyline,risks: risks });
        } catch (error) {
          setError("ルート取得中にエラーが発生しました。");
        }
      }
    },
    [currentLocation]
  );
  
  const handleMapClick = async (event: google.maps.MapMouseEvent) => {
    const latLng = event.latLng?.toJSON();
    if (latLng && currentLocation) {
      setEndPoint(latLng);
      await fetchSafeRoute(latLng);
    }
  };

  if (loadError) {
    return <div>Error loading maps</div>;
  }

  if (!isLoaded) {
    return <p>Loading map...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }


  console.log(routeData);
  return (
    <div>
      {currentLocation ? (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={currentLocation || center}
          zoom={13}
          onClick={handleMapClick}
        >
          {routeData.path.length > 0 && <Polyline path={routeData.path} options={{ strokeColor: "#0000FF", strokeWeight: 5 }} />}
          {currentLocation && (
            <Marker
              position={currentLocation}  // { lat: number, lng: number }形式が必須
              label="Start"
            />
          )}
          {endPoint && (
            <Marker
              position={endPoint}  // { lat: number, lng: number }形式が必須
              label="End"
            />
          )}

          {routeData.risks.map((risk, index) => {
            if (risk.lat === undefined || risk.lng === undefined) return null;
            
            const riskPosition: google.maps.LatLngLiteral = { lat: risk.lat, lng: risk.lng };  // ここで変数に代入
            return (
              <Marker
                key={index}
                position={riskPosition}  // positionにlatLngLiteral形式を渡す
                label={`Risk ${index + 1}`}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                }}
              />
            );
          })}
        </GoogleMap>
      ) : (
        <p>Getting your location...</p>
      )}
    </div>
  );
}

export default Home;
