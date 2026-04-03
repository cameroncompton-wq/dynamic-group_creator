import json
import csv
import requests
import hmac
import hashlib
import base64
from urllib.parse import urlencode

"""
This script manages LogicMonitor device group organization and dynamic appliesTo expressions
based on a configurable schema. Each schema layer is mapped to a group path segment and an
appliesTo sub-expression. Layers may include forced static literal conditions via STATIC_LAYER_LITERALS,
which are merged into appliesTo logic but do not affect group path construction.
"""
# Configs
CREATE_GROUPS = False
DEBUG = False
DRY_RUN = False
UPDATE_EXISTING_APPLIESTO = False
LM_PORTAL = 'nttdataincusgainwell'
# Config: Top-level group under which all schema-based groups are created
PARENT_GROUP = "Devices by Credentials"

# Focus only on specific top-level customers (first path segment under PARENT_GROUP)
# Leave as an empty set to process ALL customers. Example to focus on one or more:
# FOCUS_CUSTOMERS = {"CONNECTICUT"}
FOCUS_CUSTOMERS = {"KANSAS","Kansas"}
EXCLUDE_CUSTOMERS = {}
#EXCLUDE_CUSTOMERS = {"KANSAS","ARKANSAS","PRINT CENTER","Print Center","Medical","OHIO MITS","NTT","CALIFORNIA-MEDICAL","NTT_RBA","NTT-Data","GMCF","Aca","California","CALIFORNIA","Dentical Medical","Dentical"}
#TARGET_SCHEMA = "=customer||system.aws.customer||auto.system.normalization.customerAND=department||auto.system.normalization.department||aws.departmentAND=device_type||auto.system.normalization.device_type"

#NTT
#customer/operating_system/environment/domain_name
#TARGET_SCHEMA = "auto.site_id||site_id"
#TARGET_SCHEMA = "customer||auto.system.normalization.customer"
#TARGET_SCHEMA = "customer||auto.system.normalization.customerANDoperating_system||auto.system.normalization.operating_systemANDenvironment||auto.system.normalization.environmentANDdomain_name||auto.system.normalization.domain_name"
#TARGET_SCHEMA = "customerANDdepartmentANDdevice_type"
#Devices by Customer
#TARGET_SCHEMA = "customer||auto.system.normalization.customer"
#Devices by Domain
#TARGET_SCHEMA = "=customer||=auto.system.normalization.customerANDoperating_system||auto.system.normalization.operating_systemANDenvironment||auto.system.normalization.environmentANDdomain_name||auto.system.normalization.domain_name"
#Devices by Credentials
TARGET_SCHEMA = "=customer||=auto.system.normalization.customerANDoperating_system||auto.system.normalization.operating_systemANDdomain_name||auto.system.normalization.domain_name"
# Any key listed here will be included in appliesTo using the FIRST key's value
# from the same layer if that key is missing/empty on the device.
STATIC_COPY_FROM_FIRST = {
    # add more keys here as needed
}

# Static literal conditions to force into specific layers (0-based index).
# Example: put some.key == "customerx" into layer 0:
# STATIC_LAYER_LITERALS = { 0: [ {"key": "some.key", "value": "customerx", "strict": True} ] }
STATIC_LAYER_LITERALS = {
    0: [ {"key": "customer", "value": "Kansas", "strict": True},{"key": "auto.system.normalization.customer", "value": "Kansas", "strict": True} ]
   # 1: [ {"key": "someother.key", "value": "customerY", "strict": True} ],
}
print(f"[INFO] PARENT_GROUP/TARGET_SCHEMA = {PARENT_GROUP} {TARGET_SCHEMA}")
#customer/operating_system/environment/domain_name/display_name

created_count = 0
updated_count = 0
dryrun_created = 0
dryrun_updated = 0
newly_created_paths = set()

# Replace with your actual LogicMonitor credentials
# Load credentials

with open("/Users/cameron.compton/ps_toolkit/PortalClone/secrets", "r") as cred_file:
    credentials = json.load(cred_file)

print(f"[INFO] LM_PORTAL = {LM_PORTAL}")
company_creds = credentials.get(LM_PORTAL)
LM_API_ID = company_creds.get("accessId")
LM_API_KEY = company_creds.get("accessKey")

BASE_URL = f'https://{LM_PORTAL}.logicmonitor.com/santaba/rest'

def debug_log(msg):
    if DEBUG:
        print(f"[DEBUG] {msg}")

def get_auth_headers(method, path, data=""):
    epoch = str(int(time.time() * 1000))
    if method == "GET":
        to_sign = method + epoch + "" + path
    else:
        to_sign = method + epoch + data + path
    signature = base64.b64encode(
        hmac.new(LM_API_KEY.encode(), to_sign.encode(), hashlib.sha256).hexdigest().encode()
    ).decode()
    return {
        "Authorization": f"LMv1 {LM_API_ID}:{signature}:{epoch}",
        "Content-Type": "application/json",
    }

def api_post(path, payload):
    if DRY_RUN:
        print(f"[DRY RUN] Would POST to {path} with payload: {json.dumps(payload)}")
        return {"status": 200, "body": '{"id":"simulated_id"}'}
    url = f"https://{LM_PORTAL}.logicmonitor.com/santaba/rest{path}?v=3"
    headers = get_auth_headers("POST", path, json.dumps(payload))
    response= ""
    for attempt in range(3):
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 429:
            print(
                f"[RATE LIMIT] Hit rate limit on POST {path}. Waiting 10 seconds... (Attempt {attempt + 1}/3)")
            time.sleep(10)
            continue
        else:
            break
    return {"status": response.status_code, "body": response.text}

def api_patch(path, payload):
    if DRY_RUN:
        print(f"[DRY RUN] Would PATCH to {path} with payload: {json.dumps(payload)}")
        return {"status": 200, "body": '{"id":"simulated_id"}'}
    url = f"https://{LM_PORTAL}.logicmonitor.com/santaba/rest{path}?v=3"
    headers = get_auth_headers("PATCH", path, json.dumps(payload))
    response = ""
    for attempt in range(3):
        response = requests.patch(url, headers=headers, json=payload)
        if response.status_code == 429:
            print(f"[RATE LIMIT] Hit rate limit on PATCH {path}. Waiting 10 seconds... (Attempt {attempt + 1}/3)")
            time.sleep(10)
            continue
        else:
            break
    return {"status": response.status_code, "body": response.text}


import time


def api_get(path, filter=None, fields=None, retries=3, page_size=1000):


    items = []
    offset = 0
    headers = get_auth_headers("GET", path)

    while True:
        query_params = {
            "v": "3",
            "size": page_size,
            "offset": offset
        }
        if filter:
            query_params["filter"] = filter
        if fields:
            query_params["fields"] = fields

        encoded_params = urlencode(query_params)
        full_path = f"{path}?{encoded_params}"
        url = f"https://{LM_PORTAL}.logicmonitor.com/santaba/rest{full_path}"

        for attempt in range(retries):
            response = requests.get(url, headers=headers)
            if response.status_code == 429:
                print(f"[RATE LIMIT] Hit rate limit on GET {path}. Waiting 10 seconds... (Attempt {attempt + 1}/{retries})")
                time.sleep(10)
                continue
            else:
                break

        if response.status_code != 200:
            return {"status": response.status_code, "body": response.text}

        result = json.loads(response.text)
        page_items = result.get("items", [])
        items.extend(page_items)

        if len(page_items) < page_size:
            break

        offset += len(page_items)

    return {"status": 200, "body": json.dumps({"items": items})}


# --- SCHEMA LOGIC ---
import re

def parse_layer_expression(layer_str):
    """
    Parse a layer string with && and || operators, with && having higher precedence than ||.
    Returns a nested dict structure representing the expression.
    Example:
      "state||domain_name&&country" ->
      {
        'op': 'OR',
        'parts': [
          {'key': 'state'},
          {
            'op': 'AND',
            'parts': [
              {'key': 'domain_name'},
              {'key': 'country'}
            ]
          }
        ]
      }
    """
    # Tokenize the string by splitting on '||' and '&&', keeping operators.
    # We'll use a regex to split and keep delimiters.
    tokens = re.split(r'(\|\||&&)', layer_str)
    tokens = [t.strip() for t in tokens if t.strip() != '']

    # First, split tokens by '||' to get OR parts
    or_parts = []
    current_and_part = []

    def parse_and_parts(parts):
        # parts is a list of tokens without '||'
        and_parts = []
        i = 0
        while i < len(parts):
            token = parts[i]
            if token == '&&':
                # skip operator, handled by grouping
                i += 1
                continue
            else:
                # token is a key
                and_parts.append({'key': token})
                i += 1
                # if next token is '&&', continue, else break
                if i < len(parts) and parts[i] == '&&':
                    i += 1  # skip '&&'
                else:
                    # no more '&&' in sequence
                    pass
        if len(and_parts) == 1:
            return and_parts[0]
        else:
            return {'op': 'AND', 'parts': and_parts}

    # Split tokens by '||' operator
    temp = []
    for token in tokens:
        if token == '||':
            # parse current temp as AND parts
            or_parts.append(parse_and_parts(temp))
            temp = []
        else:
            temp.append(token)
    if temp:
        or_parts.append(parse_and_parts(temp))

    if len(or_parts) == 1:
        return or_parts[0]
    else:
        return {'op': 'OR', 'parts': or_parts}

def parse_schema(schema_str):
    """
    Parses the schema string into a list of LAYER expressions and a list of separators between them.
    Supports 'AND' and 'OR' as top-level separators (replacing '/' and '//').
    Within each layer, supports '&&' and '||' with precedence ('&&' binds tighter than '||').
    Returns (parsed_layers, separators) where:
      - parsed_layers is a list of nested dict structures for each layer (as produced by parse_layer_expression)
      - separators is a list of strings: each is either 'AND' or 'OR', length == len(parsed_layers) - 1
    """
    import re
    # Split on the keywords AND/OR while keeping them
    tokens = re.split(r'(AND|OR)', schema_str)
    tokens = [t.strip() for t in tokens if t.strip() != '']

    layers_raw = []
    separators = []

    # tokens alternate like: chunk, SEP, chunk, SEP, chunk ...
    for idx, tok in enumerate(tokens):
        if tok in ('AND', 'OR'):
            separators.append(tok)
        else:
            layers_raw.append(tok)

    # Parse each raw layer into its internal AND/OR tree with && and ||
    parsed_layers = [parse_layer_expression(layer) for layer in layers_raw]

    return parsed_layers, separators

def get_value(device_props, key):
    """
    Looks up the value for a key in device_props (list of dicts with 'name', 'value').
    Recognizes "=key" for strict equality (returns is_strict True).
    Returns (key, value, is_strict).
    """
    is_strict = False
    orig_key = key
    if key.startswith("="):
        is_strict = True
        key = key[1:]
    for prop in device_props:
        if prop["name"] == key:
            return (orig_key, prop["value"], is_strict)
    return (orig_key, None, is_strict)


# --- Helper for extracting the first key from a layer expression ---
def get_first_key(node):
    """
    Return the first key encountered in a layer's expression tree.
    This is used for group path naming and to provide a base value for
    static copy tokens that should mirror the layer's first key value.
    """
    if isinstance(node, dict):
        if 'key' in node:
            return node['key']
        if 'parts' in node and node['parts']:
            return get_first_key(node['parts'][0])
    return None

def build_group_path(device_props, layers):
    """
    Builds the group path for LogicMonitor using only the first key from each schema layer.
    If any required property is missing or empty, returns None.
    """
    path_parts = []
    for layer in layers:
        # Only use the first key in each layer for path
        key = get_first_key(layer)
        if key is None:
            return None
        _, value, _ = get_value(device_props, key)
        if value is None or value == "":
            return None  # Missing property, skip group creation
        path_parts.append(value)
    return f"{PARENT_GROUP}/" + "/".join(path_parts)


# Helper: get the first (customer) segment from a group path under PARENT_GROUP
def first_segment_after_parent(group_path):
    prefix = f"{PARENT_GROUP}/"
    if group_path.startswith(prefix):
        remainder = group_path[len(prefix):]
        return remainder.split("/", 1)[0]
    return None


def build_applies_to_expr(node, device_props, layer_base_value):
    """
    Recursively build appliesTo expression string from the nested node structure.
    node can be:
      - {'key': keyname}
      - {'op': 'AND' or 'OR', 'parts': [...]}
    Uses device_props to get values and respects strict equality.
    Skips keys with missing or empty values, except for tokens in STATIC_COPY_FROM_FIRST,
    which will use the base value from the first key in the layer if their own value is missing.
    Returns expression string or None if no valid parts.
    """
    if 'key' in node:
        orig_key, value, is_strict = get_value(device_props, node['key'])
        if value is None or value == "":
            # If this key is configured to copy from the first key's value in this layer,
            # and we have a layer_base_value, use that instead of skipping.
            target_key_name = orig_key[1:] if orig_key.startswith("=") else orig_key
            if target_key_name in STATIC_COPY_FROM_FIRST and layer_base_value not in (None, ""):
                value = layer_base_value
            else:
                return None
        if is_strict:
            return f'{orig_key[1:]} == "{value}"'
        else:
            return f'{orig_key} =~ "{value}"'
    elif 'op' in node and 'parts' in node:
        parts_expr = []
        for part in node['parts']:
            expr = build_applies_to_expr(part, device_props, layer_base_value)
            if expr is not None:
                parts_expr.append(expr)
        if not parts_expr:
            return None
        joiner = " && " if node['op'] == 'AND' else " || "
        expr_combined = joiner.join(parts_expr)
        if node['op'] == 'OR' and len(parts_expr) > 1:
            return f"({expr_combined})"
        return expr_combined
    else:
        return None

# Helper to format static literal appliesTo expressions for a layer
def format_literal_expr(lit):
    """
    Format a literal appliesTo expression from a dict:
    {'key': 'k', 'value': 'v', 'strict': True/False}
    """
    key = lit['key']
    val = lit['value']
    strict = bool(lit.get('strict', True))
    if strict:
        return f'{key} == "{val}"'
    else:
        return f'{key} =~ "{val}"'

def build_applies_to(device_props, layers, separators):
    """
    Builds the appliesTo string from per-layer expressions.
    - Each layer expression is wrapped in parentheses, regardless of content.
    - Layers are joined in order using the provided separators:
        'AND' -> ' && '
        'OR'  -> ' || '
    - Keys with missing/empty values inside a layer are skipped (that sub-expression returns None),
      except for those in STATIC_COPY_FROM_FIRST, which will use the layer's first key value.
    - Forced static literal conditions can be injected into any layer using STATIC_LAYER_LITERALS.
    If a layer resolves to None (all keys missing), but has static literals, it is still included.
    Layers with neither expressions nor literals are omitted. Their adjacent
    separators are effectively ignored as we only join the surviving layers left-to-right.
    """
    layer_exprs = []
    for idx, layer in enumerate(layers):
        base_key_for_layer = get_first_key(layer)
        _, base_value_for_layer, _ = get_value(device_props, base_key_for_layer) if base_key_for_layer else (None, None, False)
        expr = build_applies_to_expr(layer, device_props, base_value_for_layer)
        # Collect any static literals configured for this layer
        literals = [format_literal_expr(l) for l in STATIC_LAYER_LITERALS.get(idx, [])]
        # Merge the layer expression with any static literals:
        # Desired behavior: ((layer_expr) || literal1 || literal2 ...)
        if expr and literals:
            layer_exprs.append(f"({expr} || {' || '.join(literals)})")
        elif expr:
            layer_exprs.append(f"({expr})")
        elif literals:
            layer_exprs.append(f"({' || '.join(literals)})")

    if not layer_exprs:
        return ""

    # If there is only one surviving layer, return it as-is (already parenthesized)
    if len(layer_exprs) == 1:
        return layer_exprs[0]

    # Join surviving layers with the original separators in order.
    # We need to align separators to surviving layers. We'll iterate across the original
    # layers, pushing separators only when both adjacent layers survived.
    surviving_indices = []
    for i, layer in enumerate(layers):
        base_key_for_layer = get_first_key(layer)
        _, base_value_for_layer, _ = get_value(device_props, base_key_for_layer) if base_key_for_layer else (None, None, False)
        expr = build_applies_to_expr(layer, device_props, base_value_for_layer)
        has_literals = bool(STATIC_LAYER_LITERALS.get(i))
        if expr or has_literals:
            surviving_indices.append(i)

    pieces = []
    for pos, layer_idx in enumerate(surviving_indices):
        pieces.append(layer_exprs[pos])  # already aligned in order
        if pos < len(surviving_indices) - 1:
            # find the corresponding original separator between this layer_idx and the next
            # separator index equals the lower of the two layer indices
            sep_idx = surviving_indices[pos]
            op = ' && ' if separators[sep_idx] == 'AND' else ' || '
            pieces.append(op)

    return ''.join(pieces)

def get_groups():
    path="/device/groups"
    fields="id,fullPath,name,appliesTo,numOfHosts,parentId"
    groupTypeFilter="groupType:\"Normal\""
    response = api_get(path=path,fields=fields,filter=groupTypeFilter)
    return json.loads(response["body"]).get("items", [])

def ensure_group_exists(full_path, applies_to, groups_by_path_lower):
    """
    Create the group (and missing parents) for the provided full_path.
    Returns the group id if known/created, otherwise None.
    """
    global created_count, dryrun_created

    existing = groups_by_path_lower.get(full_path.lower())
    if existing:
        return existing.get("id")

    if "/" not in full_path:
        print(f"[ERROR] Unable to determine parent for group {full_path}")
        return None

    parent_path, name = full_path.rsplit("/", 1)
    parent = groups_by_path_lower.get(parent_path.lower())
    parent_id = None

    if parent:
        parent_id = parent.get("id")
    else:
        # Recursively create the parent if it doesn't exist
        parent_id = ensure_group_exists(parent_path, "", groups_by_path_lower)

    if parent_id is None:
        print(f"[ERROR] No parent id found for {full_path}; skipping creation")
        return None

    payload = {
        "name": name,
        "appliesTo": applies_to or "",
        "parentId": parent_id
    }
    resp = api_post("/device/groups", payload)
    if 200 <= resp["status"] < 300:
        try:
            body = json.loads(resp["body"])
            new_id = body.get("id") or body.get("data", {}).get("id")
        except Exception:
            new_id = None
        if new_id is None and DRY_RUN:
            # Ensure we have a placeholder id during dry runs to allow child creations
            new_id = f"simulated_{len(newly_created_paths) + 1}"
        if DRY_RUN:
            dryrun_created += 1
            print(f"[DRY RUN] Would create group {full_path} (parentId: {parent_id})")
        else:
            created_count += 1
            print(f"[SUCCESS] Created group {full_path} (id: {new_id})")
        groups_by_path_lower[full_path.lower()] = {
            "id": new_id,
            "fullPath": full_path,
            "appliesTo": applies_to,
        }
        newly_created_paths.add(full_path)
        return new_id

    print(f"[ERROR] Failed to create group {full_path} (status {resp['status']}): {resp['body']}")
    return None

def main():
    global created_count, updated_count, dryrun_created, dryrun_updated
    start_time = time.time()

    device_response1 = api_get("/device/devices", "systemProperties.name:\"system.cloud.category\",systemProperties.value:\"AWS/EC2\"", "id,displayName,customProperties,systemProperties,autoProperties")
    device_response2 = api_get("/device/devices", "deviceType:0", "id,displayName,customProperties,systemProperties,autoProperties")

    devices1 = json.loads(device_response1["body"]).get("items", [])
    devices2 = json.loads(device_response2["body"]).get("items", [])

    devices = devices1 + devices2\

    if DEBUG:
        print(f"Number of devices: {len(devices)}")

    schema_layers, schema_separators = parse_schema(TARGET_SCHEMA)
    if DEBUG:
        print(f"Parsed schema layers: {schema_layers}")
        print(f"Parsed schema separators: {schema_separators}")
    skipped_devices = []
    unique_output = set()

    print(f"[INFO] Number of devices {len(devices)}")

    # Normalize focus set for case-insensitive matching (empty set => all customers)
    focus_norm = {c.lower() for c in FOCUS_CUSTOMERS} if FOCUS_CUSTOMERS else set()
    if focus_norm:
        print(f"[INFO] Focusing on customers: {sorted(FOCUS_CUSTOMERS)}")
    exclude_norm = {c.lower() for c in EXCLUDE_CUSTOMERS} if EXCLUDE_CUSTOMERS else set()
    if exclude_norm:
        print(f"[INFO] Excluding customers: {sorted(EXCLUDE_CUSTOMERS)}")


    for device in devices:
        custom_props = device.get("customProperties", [])
        custom_props += device.get("systemProperties", [])
        custom_props += device.get("autoProperties", [])
        group_path = build_group_path(custom_props, schema_layers)

        if not group_path:
            # Skip devices with incomplete data for group path
            skipped_devices.append(device.get('displayName'))
            continue

        # If focusing on specific customers, skip others
        if focus_norm:
            first_seg = first_segment_after_parent(group_path)
            if first_seg is None or first_seg.lower() not in focus_norm:
                continue

        # Exclude customers if in exclude_norm
        if exclude_norm:
            first_seg = first_segment_after_parent(group_path)
            if first_seg is not None and first_seg.lower() in exclude_norm:
                continue

        applies_to = build_applies_to(custom_props, schema_layers, schema_separators)

        #print(f"Device: {device.get('displayName')} | Group Path: {group_path} | AppliesTo: {applies_to}")
        unique_output.add((group_path, applies_to))

    # Build a mapping from group_path to applies_to for later lookup
    group_applies_map = {gp: at for gp, at in unique_output}

    if DEBUG:
        if skipped_devices:
            pass
            if DEBUG: print(f"[SKIP] Devices {skipped_devices} missing group path properties for schema {TARGET_SCHEMA}")
        else:
            print(f"No skipped Devices")

        if DEBUG: print(f"All unique group paths and appliesTo (length: {len(unique_output)}): \n")
        print(f"TARGET_SCHEMA: {TARGET_SCHEMA}")
        if not unique_output:
            print("No group paths generated.")

    # Getting group information
    groups=get_groups()
    print(f"[INFO] Number of groups {len(groups)}")

    csv_file = f"updating_applies_to_{LM_PORTAL}_{PARENT_GROUP}.csv"
    if DEBUG: print(f"Writing device data to {csv_file}")
    needs_updating = 0
    groups_not_exist = set()
    groups_by_path_lower = {g.get("fullPath", "").lower(): g for g in groups}
    try:
        with open(csv_file, mode='w', newline='') as file:
            writer = csv.writer(file)
            # Prepare the header
            headers = ["id","existsInPortal","fullPath","current_applies_to","new_applies_to","numOfHosts","isDynamic"]
            writer.writerow(headers)

            # Prepare a set of lowercased group fullPaths for quick existence check
            existing_group_paths_lower = set(g.get("fullPath", "").lower() for g in groups)

            for group_path, applies_to in unique_output:  # groups built from properties
                group_path_lower = group_path.lower()
                for group in groups:  # groups from api
                    full_path_lower = group.get("fullPath", "").lower()
                    if full_path_lower == group_path_lower:  # compare in lowercase
                        is_dynamic = group.get("appliesTo") != ""
                        writer.writerow([
                            group.get("id"),
                            True,
                            group.get("fullPath"),
                            group.get("appliesTo"),
                            applies_to,
                            group.get("numOfHosts"),
                            is_dynamic
                        ])
                        if is_dynamic: ## is the group a dynamic group
                            if group.get("appliesTo") != applies_to:
                                if DEBUG or UPDATE_EXISTING_APPLIESTO:
                                    print(f"Updating {group.get('id')} {group.get('appliesTo')} -> {applies_to}")
                                else:
                                    print(f"Would update {group.get('id')} {group.get('appliesTo')} -> {applies_to}")
                                needs_updating += 1
                                if UPDATE_EXISTING_APPLIESTO:
                                    resp = api_patch(f"/device/groups/{group.get('id')}", {"appliesTo": applies_to})
                                    if 200 <= resp["status"] < 300:
                                        updated_count += 1
                                        if DEBUG:
                                            print(f"[SUCCESS] Updated group {group.get('id')} appliesTo")
                                    else:
                                        print(f"[ERROR] Failed to update group {group.get('id')} (status {resp['status']}): {resp['body']}")
                                else:
                                    if DRY_RUN:
                                        dryrun_updated += 1
                            else:
                                if DEBUG:
                                    print(f'{group.get("fullPath")} appliesTo matches')
                        else:
                            if DEBUG:
                                print(f'{group.get("fullPath")} is a static group and should be dynamic')
                # Check if group_path (lowercased) is not in the list of existing group paths (lowercased)
                if group_path_lower not in existing_group_paths_lower:
                    groups_not_exist.add(group_path)
            for group in groups_not_exist:
                writer.writerow([
                    "",
                    False,
                    group,
                    "",
                    group_applies_map.get(group, ""),
                    "",
                    True
                ])
                if DEBUG: print(f"Groups that need to be created {group}")
    except Exception as e:
        print(f"Error writing to CSV: {e}")

    # Create the missing groups (and any missing parents) via API
    if CREATE_GROUPS:
        for group in groups_not_exist:
            applies_to = group_applies_map.get(group, "")
            ensure_group_exists(group, applies_to, groups_by_path_lower)
    elif DEBUG and groups_not_exist:
        for group in groups_not_exist:
            applies_to = group_applies_map.get(group, "")
            print(f"[INFO] Missing group (no action taken): {group} | appliesTo: {applies_to}")



    duration_sec = round(time.time() - start_time, 3)
    print(f"[SUMMARY] Groups that need to be created: {len(groups_not_exist)}")
    print(f"[SUMMARY] Groups that need to be updated: {needs_updating}")
    if DRY_RUN:
        print(f"[SUMMARY] Dry run - groups created: {dryrun_created}, groups updated: {dryrun_updated}")
    else:
        print(f"[SUMMARY] Groups created: {created_count}, Groups updated: {updated_count}")
    print(f"[SUMMARY] Script execution time: {duration_sec} seconds")

if __name__ == "__main__":
    main()
