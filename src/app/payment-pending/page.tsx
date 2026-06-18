
'use client'



import { Suspense, useEffect, useState } from "react";

import { useSearchParams, useRouter } from "next/navigation";



function PaymentPendingContent() {

  const params = useSearchParams();

  const router = useRouter();

  const identifier = params.get("identifier");

  const [message, setMessage] = useState("Vérification du paiement...");



  useEffect(() => {

    if (!identifier) return;



    let attempts = 0;

    const maxAttempts = 20;



    const checkPayment = async () => {

      attempts++;

      try {

        const res = await fetch("/api/paygate-status", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ identifier })

        });

        const statusData = await res.json();

        const status = statusData.status;



        if (status === 0 || status === "0") {

          router.replace("/payment-success");

          return;

        }



        if (status === 2 || status === "2") {

          setMessage("Paiement en attente... Confirmez sur votre téléphone.");

          if (attempts < maxAttempts) {

            setTimeout(checkPayment, 3000);

          } else {

            router.replace("/payment-failed");

          }

          return;

        }



        router.replace("/payment-failed");

      } catch (error) {

        if (attempts < maxAttempts) {

          setTimeout(checkPayment, 3000);

        } else {

          router.replace("/payment-failed");

        }

      }

    };



    checkPayment();

  }, [identifier, router]);



  return (

    <div style={{

      display: "flex",

      flexDirection: "column",

      justifyContent: "center",

      alignItems: "center",

      height: "100vh",

      fontFamily: "Arial",

      textAlign: "center"

    }}>

      <div className="loader" style={{

        border: "8px solid #f3f3f3",

        borderTop: "8px solid #1A4D8C",

        borderRadius: "50%",

        width: "60px",

        height: "60px",

        animation: "spin 1s linear infinite",

        marginBottom: "20px"

      }}></div>

      <h2>{message}</h2>

      <style>{`

        @keyframes spin {

          0% { transform: rotate(0deg);}

          100% { transform: rotate(360deg);}

        }

      `}</style>

    </div>

  );

}



export default function PaymentPendingPage() {

  return (

    <Suspense fallback={

      <div style={{

        display: "flex",

        justifyContent: "center",

        alignItems: "center",

        height: "100vh",

        fontFamily: "Arial",

        color: "#6B6560"

      }}>

        <p>Chargement...</p>

      </div>

    }>

      <PaymentPendingContent />

    </Suspense>

  );

}

