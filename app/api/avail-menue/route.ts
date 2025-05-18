import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Types
interface MenuItem {
  menu_id: number;
  name: string;
  price: number;
  status: boolean;
  description: string | null;
  K: boolean;
  other: string | null;
}

interface MenuCsv {
  menu_system_code: string;
  menu_code: string;
}

interface TransformedMenuItem {
  id: number;
  menu_code?: string;
  name: string;
  price: number;
  isActive: boolean;
  description: string | null;
  K: boolean;
  other: string | null;
}

interface UpdateMenuItemRequest {
  name: string;
  isActive?: boolean;
  price?: number;
  K?: boolean;
  other?: string | null;
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
  updatedCount?: number;
  data?: TransformedMenuItem[];
}

// Helper functions
const createErrorResponse = (message: string, status: number): NextResponse => {
  return NextResponse.json({ error: message } as ErrorResponse, { status });
};

const createSuccessResponse = (data: SuccessResponse): NextResponse => {
  return NextResponse.json(data);
};

// Route handlers
export async function GET() {
  try {
    const [menuItems, menuCsvs] = await Promise.all([
      prisma.menuItem.findMany({
        orderBy: {
          menu_id: "asc",
        },
        select: {
          menu_id: true,
          name: true,
          price: true,
          status: true,
          description: true,
          K: true,
          other: true,
        },
      }),
      prisma.menuCsv.findMany({
        select: {
          menu_system_code: true,
          menu_code: true,
        },
      }),
    ]);

    const transformedItems: TransformedMenuItem[] = menuItems.map(
      (item: MenuItem) => ({
        id: item.menu_id,
        menu_code: menuCsvs.find(
          (csv: MenuCsv) => csv.menu_system_code === item.menu_id.toString()
        )?.menu_code,
        name: item.name,
        price: Number(item.price),
        isActive: item.status,
        description: item.description,
        K: item.K,
        other: item.other,
      })
    );

    return createSuccessResponse({
      success: true,
      data: transformedItems,
    });
  } catch (error) {
    console.error("Database error:", error);
    return createErrorResponse("Error fetching available menu items", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as UpdateMenuItemRequest;

    // Run existence check and update in parallel
    const [existingItem, updatedItem] = await Promise.all([
      prisma.menuItem.findFirst({
        where: { name: body.name },
      }),
      prisma.menuItem.updateMany({
        where: { name: body.name },
        data: {
          ...(body.isActive !== undefined && { status: body.isActive }),
          ...(body.price !== undefined && { price: body.price }),
          ...(body.K !== undefined && { K: body.K }),
          ...(body.other !== undefined && {
            other: body.other,
          }),
          updated_at: new Date(),
        },
      }),
    ]);

    if (!existingItem || updatedItem.count === 0) {
      return createErrorResponse("Available menu item not found", 404);
    }

    return createSuccessResponse({
      success: true,
      updatedCount: updatedItem.count,
    });
  } catch (error) {
    console.error("Update error:", error);
    return createErrorResponse("Error updating available menu item", 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
