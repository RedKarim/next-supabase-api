import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Types
interface Ingredient {
  ingredient_id: number;
  material_system_code: string;
  name: string;
  date: string;
  quantity: number;
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
  data?: Ingredient[];
}

// Helper functions
const createErrorResponse = (message: string, status: number): NextResponse => {
  return NextResponse.json({ error: message } as ErrorResponse, { status });
};

const createSuccessResponse = (data: SuccessResponse): NextResponse => {
  return NextResponse.json(data);
};

// Route handlers
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const weekDates = searchParams.get("weekDates")?.split(",") || [];

    if (!weekDates.length) {
      return createErrorResponse(
        "Please provide week dates to fetch ingredients",
        400
      );
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session) {
      return createErrorResponse(
        "Authentication required. Please log in to continue.",
        401
      );
    }

    const storeId = session.session?.user?.user_metadata?.company_code;

    const { data: ingredients, error } = await supabase
      .from("Ingredient")
      .select(
        `
        ingredient_id,
        material_system_code,
        name,
        date,
        quantity
      `
      )
      .eq("store_id", storeId)
      .in("date", weekDates);

    if (error) {
      console.error("Failed to fetch ingredients:", error);
      return createErrorResponse(
        "Unable to fetch ingredients. Please try again later.",
        500
      );
    }

    return createSuccessResponse({
      success: true,
      data: ingredients || [],
    });
  } catch (error) {
    console.error("Failed to process ingredients request:", error);
    return createErrorResponse(
      "An unexpected error occurred while fetching ingredients",
      500
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
